import Foundation

/// 한 그루의 측정 결과.
/// 건너뛸 수 있는 항목(지하고, 흉고직경, 수관폭)은 Optional 로 둡니다.
/// 0 으로 저장하면 "측정 안 함"과 "실제 0"을 구분할 수 없기 때문입니다.
struct TreeMeasurementData {
    var height: Double = 0.0          // 수고 (m)
    var heightAngle: Double = 0.0     // 꼭대기 조준 고도각 (°)

    var clearLength: Double? = nil    // 지하고 (m)
    var branchAngle: Double? = nil    // 가지 시작점 조준 고도각 (°)

    var crownWidth: Double? = nil     // 수관폭 (m)
    var azimuth: Double = 0.0         // 측정 방위각 (관측자 → 나무, 북쪽 기준 0~360°)

    var dbh: Double? = nil            // 흉고직경 (cm)
    var timestamp: Date = Date()
}

/// Supabase `tree_measurements` 테이블에 보낼 형태 (컬럼명은 snake_case 로 변환됨)
struct TreeMeasurementRecord: Encodable {
    let height: Double
    let heightAngle: Double
    let clearLength: Double?
    let branchAngle: Double?
    let dbh: Double?
    let crownWidth: Double?
    let azimuth: Int                  // DB 컬럼이 integer 이므로 정수로 보냄

    init(_ m: TreeMeasurementData) {
        // 측정값은 소수점 첫째 자리(X.X)로 반올림
        func r1(_ v: Double) -> Double { (v * 10).rounded(.toNearestOrAwayFromZero) / 10 }
        height = r1(m.height)
        heightAngle = r1(m.heightAngle)
        clearLength = m.clearLength.map(r1)
        branchAngle = m.branchAngle.map(r1)
        dbh = m.dbh.map(r1)
        crownWidth = m.crownWidth.map(r1)
        azimuth = Int(m.azimuth.rounded()) % 360
    }
}
