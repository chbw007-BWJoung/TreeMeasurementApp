import SwiftUI
import ARKit
import SceneKit
import simd

// MARK: - 측정 단계

enum MeasurementStep: String, CaseIterable {
    case base = "1. 나무 밑동(지면) 터치"
    case top = "2. 나무 꼭대기 터치 (수고)"
    case branch = "3. 가지 시작점 터치 (지하고)"
    case dbhLeft = "4. 줄기 왼쪽 끝 터치 (흉고직경, 흰 점 높이)"
    case dbhRight = "5. 줄기 오른쪽 끝 터치"
    case crownLeft = "6. 수관 왼쪽 끝 터치"
    case crownRight = "7. 수관 오른쪽 끝 터치 (수관폭)"
    case done = "측정 완료 — 저장하세요"

    /// 건너뛸 수 있는 단계
    var isSkippable: Bool {
        switch self {
        case .branch, .dbhLeft, .dbhRight, .crownLeft, .crownRight: return true
        default: return false
        }
    }

    var next: MeasurementStep {
        let all = Self.allCases
        guard let i = all.firstIndex(of: self), i + 1 < all.count else { return .done }
        return all[i + 1]
    }

    /// 건너뛰기를 누르면 이동할 단계 (좌/우 쌍은 함께 건너뜀)
    var afterSkip: MeasurementStep {
        switch self {
        case .branch: return .dbhLeft
        case .dbhLeft, .dbhRight: return .crownLeft
        case .crownLeft, .crownRight: return .done
        default: return next
        }
    }
}

// MARK: - 측정 로직
//
// 원리
// 1) 밑동: ARKit 레이캐스트로 지면의 3D 좌표를 얻습니다.
// 2) 꼭대기·가지·줄기·수관 끝: 하늘/잎에는 레이캐스트가 맞지 않으므로,
//    "밑동을 지나고 관측자를 향하는 수직 평면(나무 평면)"과
//    화면 터치 지점에서 나온 시선(ray)의 교점을 구합니다.
//    → 수고 = 교점 높이 − 밑동 높이, 폭 = 두 교점의 수평 거리.
// 3) 방위각: worldAlignment = .gravityAndHeading 이면 -Z 가 북쪽, +X 가 동쪽입니다.

@MainActor
final class TreeMeasurementModel: NSObject, ObservableObject {
    @Published var step: MeasurementStep = .base
    @Published var data = TreeMeasurementData()
    @Published var message: String?
    @Published var trackingText = "주변 바닥을 천천히 비춰 주세요"
    @Published var isSaving = false

    weak var sceneView: ARSCNView?

    private var basePoint: simd_float3?
    private var dbhLeftPoint: simd_float3?
    private var crownLeftPoint: simd_float3?
    private var markerNodes: [SCNNode] = []

    /// 흉고 높이 (지상 1.2 m, 국내 산림조사 기준)
    private let breastHeight: Float = 1.2

    // MARK: 세션

    func startSession() {
        guard let sceneView else { return }
        guard ARWorldTrackingConfiguration.isSupported else {
            message = "이 기기는 AR 월드 트래킹을 지원하지 않습니다."
            return
        }
        let config = ARWorldTrackingConfiguration()
        config.worldAlignment = .gravityAndHeading   // 방위각 계산용 (나침반 정렬)
        config.planeDetection = [.horizontal]
        // LiDAR 기기(Pro 모델)는 메시를 사용해 지면 인식이 더 정확합니다.
        if ARWorldTrackingConfiguration.supportsSceneReconstruction(.mesh) {
            config.sceneReconstruction = .mesh
        }
        sceneView.session.run(config, options: [.resetTracking, .removeExistingAnchors])
    }

    func reset() {
        markerNodes.forEach { $0.removeFromParentNode() }
        markerNodes.removeAll()
        basePoint = nil
        dbhLeftPoint = nil
        crownLeftPoint = nil
        data = TreeMeasurementData()
        message = nil
        step = .base
    }

    func skip() {
        guard step.isSkippable else { return }
        // 좌측만 찍고 건너뛴 경우 값 정리
        if step == .dbhRight { dbhLeftPoint = nil; data.dbh = nil }
        if step == .crownRight { crownLeftPoint = nil; data.crownWidth = nil }
        message = nil
        step = step.afterSkip
    }

    // MARK: 터치 처리

    @objc func handleTap(_ gesture: UITapGestureRecognizer) {
        guard let view = sceneView, step != .done else { return }
        let point = gesture.location(in: view)
        message = nil

        switch step {
        case .base:
            setBase(at: point, in: view)

        case .top:
            guard let p = pointOnTreePlane(point), let base = basePoint else { return }
            let h = Double(p.y - base.y)
            guard h > 0.3 else { message = "밑동보다 위쪽을 터치하세요."; return }
            data.height = h
            data.heightAngle = elevationAngle(to: p)
            addMarker(p, color: .systemGreen)
            addLine(base, p, color: .systemGreen)
            step = step.next

        case .branch:
            guard let p = pointOnTreePlane(point), let base = basePoint else { return }
            let c = Double(p.y - base.y)
            guard c >= 0, c < data.height else { message = "지하고는 0 이상, 수고보다 낮아야 합니다."; return }
            data.clearLength = c
            data.branchAngle = elevationAngle(to: p)
            addMarker(p, color: .systemOrange)
            step = step.next

        case .dbhLeft:
            guard let p = pointOnTreePlane(point) else { return }
            dbhLeftPoint = p
            addMarker(p, color: .systemPurple, radius: 0.01)
            step = step.next

        case .dbhRight:
            guard let p = pointOnTreePlane(point), let left = dbhLeftPoint else { return }
            let cm = Double(horizontalDistance(left, p)) * 100
            guard cm > 1, cm < 500 else { message = "흉고직경이 비정상적입니다(\(Int(cm)) cm). 다시 터치하세요."; return }
            data.dbh = cm
            addMarker(p, color: .systemPurple, radius: 0.01)
            addLine(left, p, color: .systemPurple)
            step = step.next

        case .crownLeft:
            guard let p = pointOnTreePlane(point) else { return }
            crownLeftPoint = p
            addMarker(p, color: .systemTeal)
            step = step.next

        case .crownRight:
            guard let p = pointOnTreePlane(point), let left = crownLeftPoint else { return }
            let w = Double(horizontalDistance(left, p))
            guard w > 0.1 else { message = "수관 반대쪽 끝을 터치하세요."; return }
            data.crownWidth = w
            addMarker(p, color: .systemTeal)
            addLine(left, p, color: .systemTeal)
            step = step.next

        case .done:
            break
        }
    }

    private func setBase(at point: CGPoint, in view: ARSCNView) {
        guard let query = view.raycastQuery(from: point, allowing: .estimatedPlane, alignment: .horizontal),
              let hit = view.session.raycast(query).first else {
            message = "지면을 인식하지 못했습니다. 바닥을 조금 더 비춘 뒤 밑동을 터치하세요."
            return
        }
        let p = hit.worldTransform.position
        guard let cam = view.session.currentFrame?.camera.transform.position else { return }

        basePoint = p
        data.azimuth = azimuthDegrees(from: cam, to: p)
        addMarker(p, color: .systemYellow)
        // 흉고(1.2 m) 위치 안내 점
        addMarker(p + simd_float3(0, breastHeight, 0), color: .white, radius: 0.015)
        step = step.next
    }

    // MARK: 기하 계산

    /// 화면 좌표 → "나무 평면"(밑동을 지나는 수직 평면, 법선 = 나무→관측자 수평 방향)과의 교점
    private func pointOnTreePlane(_ screenPoint: CGPoint) -> simd_float3? {
        guard let view = sceneView, let base = basePoint,
              let cam = view.session.currentFrame?.camera.transform.position else { return nil }

        var normal = cam - base
        normal.y = 0
        guard simd_length(normal) > 0.5 else {
            message = "나무에서 너무 가깝습니다. 뒤로 물러나세요."
            return nil
        }
        normal = simd_normalize(normal)

        let x = Float(screenPoint.x), y = Float(screenPoint.y)
        let near = view.unprojectPoint(SCNVector3(x, y, 0)).vec
        let far = view.unprojectPoint(SCNVector3(x, y, 1)).vec
        let dir = simd_normalize(far - near)

        let denom = simd_dot(dir, normal)
        guard abs(denom) > 1e-4 else { message = "나무 쪽을 향해 터치하세요."; return nil }
        let t = simd_dot(base - near, normal) / denom
        guard t > 0 else { message = "나무 쪽을 향해 터치하세요."; return nil }
        return near + dir * t
    }

    private func horizontalDistance(_ a: simd_float3, _ b: simd_float3) -> Float {
        simd_length(simd_float2(a.x - b.x, a.z - b.z))
    }

    /// 카메라에서 본 고도각(°): 위쪽이 +
    private func elevationAngle(to p: simd_float3) -> Double {
        guard let cam = sceneView?.session.currentFrame?.camera.transform.position else { return 0 }
        let d = p - cam
        let horizontal = simd_length(simd_float2(d.x, d.z))
        return Double(atan2(d.y, horizontal)) * 180 / .pi
    }

    /// 관측자 → 나무 방향의 방위각 (북 0°, 동 90°)
    private func azimuthDegrees(from cam: simd_float3, to p: simd_float3) -> Double {
        let east = Double(p.x - cam.x)
        let north = Double(-(p.z - cam.z))
        var deg = atan2(east, north) * 180 / .pi
        if deg < 0 { deg += 360 }
        return deg
    }

    // MARK: 화면 표시

    private func addMarker(_ p: simd_float3, color: UIColor, radius: CGFloat = 0.03) {
        let sphere = SCNSphere(radius: radius)
        sphere.firstMaterial?.diffuse.contents = color
        sphere.firstMaterial?.lightingModel = .constant
        let node = SCNNode(geometry: sphere)
        node.simdPosition = p
        sceneView?.scene.rootNode.addChildNode(node)
        markerNodes.append(node)
    }

    private func addLine(_ a: simd_float3, _ b: simd_float3, color: UIColor) {
        let source = SCNGeometrySource(vertices: [SCNVector3(a.x, a.y, a.z), SCNVector3(b.x, b.y, b.z)])
        let element = SCNGeometryElement(indices: [Int32(0), Int32(1)], primitiveType: .line)
        let geometry = SCNGeometry(sources: [source], elements: [element])
        geometry.firstMaterial?.diffuse.contents = color
        geometry.firstMaterial?.lightingModel = .constant
        let node = SCNNode(geometry: geometry)
        sceneView?.scene.rootNode.addChildNode(node)
        markerNodes.append(node)
    }

    // MARK: 저장

    func save() async {
        isSaving = true
        defer { isSaving = false }
        data.timestamp = Date()
        do {
            try await SupabaseService.insert(data)
            message = "✅ Supabase DB에 저장되었습니다."
        } catch {
            message = "저장 실패: \(error.localizedDescription)"
        }
    }
}

// MARK: - 추적 상태 안내

extension TreeMeasurementModel: ARSessionDelegate {
    nonisolated func session(_ session: ARSession, cameraDidChangeTrackingState camera: ARCamera) {
        let text: String
        switch camera.trackingState {
        case .normal: text = ""
        case .notAvailable: text = "AR 추적을 사용할 수 없습니다"
        case .limited(let reason):
            switch reason {
            case .initializing: text = "초기화 중… 바닥을 천천히 비춰 주세요"
            case .excessiveMotion: text = "너무 빠르게 움직이고 있습니다"
            case .insufficientFeatures: text = "바닥의 무늬가 부족합니다. 밝은 곳을 비춰 주세요"
            case .relocalizing: text = "위치를 다시 맞추는 중…"
            @unknown default: text = "추적이 제한되었습니다"
            }
        }
        Task { @MainActor in self.trackingText = text }
    }

    nonisolated func session(_ session: ARSession, didFailWithError error: Error) {
        let text = "AR 오류: \(error.localizedDescription)"
        Task { @MainActor in self.message = text }
    }
}

// MARK: - ARSCNView 래퍼

struct ARViewContainer: UIViewRepresentable {
    let model: TreeMeasurementModel

    func makeUIView(context: Context) -> ARSCNView {
        let view = ARSCNView(frame: .zero)
        view.automaticallyUpdatesLighting = true
        view.session.delegate = model
        let tap = UITapGestureRecognizer(target: model, action: #selector(TreeMeasurementModel.handleTap(_:)))
        view.addGestureRecognizer(tap)
        model.sceneView = view
        model.startSession()
        return view
    }

    func updateUIView(_ uiView: ARSCNView, context: Context) {}

    static func dismantleUIView(_ uiView: ARSCNView, coordinator: ()) {
        uiView.session.pause()
    }
}

// MARK: - 화면

struct ARMeasurementView: View {
    @StateObject private var model = TreeMeasurementModel()

    var body: some View {
        ZStack {
            ARViewContainer(model: model)
                .ignoresSafeArea()

            VStack(spacing: 8) {
                // 상단 안내
                VStack(spacing: 4) {
                    Text(model.step.rawValue)
                        .font(.headline)
                    if !model.trackingText.isEmpty {
                        Text(model.trackingText).font(.caption).foregroundColor(.yellow)
                    }
                    if let msg = model.message {
                        Text(msg).font(.caption).foregroundColor(.white)
                    }
                }
                .multilineTextAlignment(.center)
                .padding(10)
                .frame(maxWidth: .infinity)
                .background(.black.opacity(0.6))
                .cornerRadius(10)

                Spacer()

                // 결과
                VStack(alignment: .leading, spacing: 4) {
                    resultRow("수고", model.data.height > 0 ? String(format: "%.1f m", model.data.height) : nil)
                    resultRow("지하고", model.data.clearLength.map { String(format: "%.1f m", $0) })
                    resultRow("흉고직경", model.data.dbh.map { String(format: "%.1f cm", $0) })
                    resultRow("수관폭", model.data.crownWidth.map { String(format: "%.1f m", $0) })
                    resultRow("방위각", model.step == .base ? nil : String(format: "%.0f°", model.data.azimuth))
                }
                .font(.system(.body, design: .monospaced))
                .padding(10)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(.black.opacity(0.6))
                .cornerRadius(10)

                // 버튼
                HStack {
                    Button("처음부터") { model.reset() }
                        .buttonStyle(.bordered)

                    if model.step.isSkippable {
                        Button("건너뛰기") { model.skip() }
                            .buttonStyle(.bordered)
                    }

                    Spacer()

                    if model.step == .done {
                        Button(model.isSaving ? "저장 중…" : "DB에 저장") {
                            Task { await model.save() }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(model.isSaving)
                    }
                }
            }
            .foregroundColor(.white)
            .padding()
        }
    }

    private func resultRow(_ label: String, _ value: String?) -> some View {
        HStack {
            Text(label)
            Spacer()
            Text(value ?? "–")
        }
    }
}

// MARK: - 보조 확장

private extension simd_float4x4 {
    var position: simd_float3 { simd_float3(columns.3.x, columns.3.y, columns.3.z) }
}

private extension SCNVector3 {
    var vec: simd_float3 { simd_float3(x, y, z) }
}
