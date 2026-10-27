# SáoVoxy

Ứng dụng luyện tiếng Anh cài được lên điện thoại (PWA): nghe & chép chính tả, phát âm có chấm điểm, bài học kiểu Duolingo, hội thoại với gia sư AI, thẻ từ vựng lặp lại ngắt quãng, cấp độ CEFR A1–C2, chuỗi ngày học và nhắc học hằng ngày.

## Cấu trúc

| File | Vai trò |
|---|---|
| `index.html` | Toàn bộ giao diện và logic (không cần build) |
| `manifest.webmanifest` | Cho phép cài ra màn hình chính |
| `sw.js` | Chạy offline, kiểm tra và gửi thông báo nhắc học |
| `api/chat.js` | Hàm serverless Vercel gọi Claude cho gia sư AI |
| `icons/` | Biểu tượng app |

## Deploy lên Vercel

1. Tạo project mới trên Vercel, upload thư mục này (hoặc push lên GitHub rồi import).
2. Vào **Settings → Environment Variables**, thêm `ANTHROPIC_API_KEY` (khóa API của bạn từ console.anthropic.com). Tùy chọn: `ELOCU_MODEL` (mặc định `claude-haiku-5-5`).
3. Deploy. Mở link trên điện thoại.

## Cài lên điện thoại

- **iPhone (iOS 16.4+)**: mở bằng Safari → Chia sẻ → *Thêm vào MH chính*. Mở app từ biểu tượng, vào **Hồ sơ → Nhắc học** để bật thông báo.
- **Android**: mở bằng Chrome → *Cài đặt ứng dụng*, hoặc nút **Cài app** trong Hồ sơ.

## Nhắc học hoạt động thế nào

- Bạn chọn giờ nhắc. App chỉ nhắc nếu hôm đó bạn chưa có XP nào, và tối đa một lần mỗi ngày.
- **Android (Chrome, đã cài app)**: dùng Periodic Background Sync, Chrome sẽ thức dậy định kỳ để kiểm tra và gửi nhắc nhở ngay cả khi app đóng. Tần suất do Chrome quyết định theo mức bạn dùng app.
- **iPhone**: iOS không cho web app tự thức dậy trong nền. Thông báo hiện khi app đang mở hoặc vừa chạy nền. Để nhắc chắc chắn lúc app đóng cần **Web Push từ server** (sw.js đã có sẵn trình xử lý `push`; phần còn thiếu là một cron job gửi push bằng khóa VAPID và nơi lưu subscription, ví dụ Supabase).

## Chấm phát âm

Dùng Web Speech API của trình duyệt (Chrome, Edge, Safari). Điểm = tỉ lệ từ được nhận đúng so với câu mẫu, tô màu từng từ. Đây là mức chấm theo từ; muốn chấm tới âm vị (phoneme) và ngữ điệu như ELSA cần dịch vụ như Azure Pronunciation Assessment ở backend.

## Dữ liệu

Tiến độ lưu trong trình duyệt của máy (localStorage). Xóa dữ liệu trình duyệt sẽ mất tiến độ; đồng bộ nhiều thiết bị cần thêm tài khoản và database.

## Tài khoản & đồng bộ (Supabase)

- Dự án Supabase: `saolingo` (ap-southeast-1), bảng `public.user_progress` có RLS: mỗi người chỉ đọc/ghi dòng của mình.
- Đăng nhập: link qua email (không mật khẩu) và Google.
- Sau khi có domain Vercel: Supabase → Authentication → URL Configuration → đặt **Site URL** = domain đó, thêm vào **Redirect URLs**.
- Google: Supabase → Authentication → Providers → Google, dán Client ID/Secret từ Google Cloud.
- Tiến độ lưu ở máy và tự đồng bộ lên tài khoản (bản mới hơn sẽ thắng).
