import Foundation

/// Supabase REST API 로 측정값을 저장합니다 (외부 패키지 없이 URLSession 사용).
enum SupabaseService {
    // 웹 앱(supabaseClient.js)과 같은 프로젝트입니다.
    // 주의: 프로젝트 ref 만이 아니라 전체 URL 이어야 합니다.
    static let projectURL = URL(string: "https://ljhrhnbdqekitetzjrck.supabase.co")!
    static let anonKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxqaHJobmJkcWVraXRldHpqcmNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM4NjMyNzIsImV4cCI6MjEwOTQzOTI3Mn0.WyHD7ng1ciGB-xTayNUGFryCRg2bRPjMLSxiUuughYg"

    enum SaveError: LocalizedError {
        case http(Int, String)
        var errorDescription: String? {
            switch self {
            case let .http(code, body): return "서버 오류 \(code): \(body)"
            }
        }
    }

    static func insert(_ measurement: TreeMeasurementData) async throws {
        var request = URLRequest(url: projectURL.appendingPathComponent("rest/v1/tree_measurements"))
        request.httpMethod = "POST"
        request.setValue(anonKey, forHTTPHeaderField: "apikey")
        request.setValue("Bearer \(anonKey)", forHTTPHeaderField: "Authorization")
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue("return=minimal", forHTTPHeaderField: "Prefer")

        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase   // clearLength → clear_length 등
        request.httpBody = try encoder.encode(TreeMeasurementRecord(measurement))

        let (data, response) = try await URLSession.shared.data(for: request)
        let code = (response as? HTTPURLResponse)?.statusCode ?? -1
        guard (200..<300).contains(code) else {
            throw SaveError.http(code, String(data: data, encoding: .utf8) ?? "")
        }
    }
}
