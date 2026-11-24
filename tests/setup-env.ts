// 테스트는 항상 테스트 DB를 씁니다. 운영 DB에 붙지 않도록 DATABASE_URL 을 덮어씁니다.
try {
  process.loadEnvFile(".env");
} catch {
  // CI 등에서는 환경변수로 직접 지정
}
const testUrl = process.env.TEST_DATABASE_URL;
if (testUrl) process.env.DATABASE_URL = testUrl;
