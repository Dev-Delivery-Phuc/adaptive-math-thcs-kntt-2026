# AdaptiveMath — Nền tảng học Toán THCS thích ứng

Ứng dụng web giúp học sinh THCS Việt Nam lớp 6, 7, 8, 9 học Toán theo **Chương trình GDPT 2018**. Nội dung được tổ chức theo bộ SGK Kết nối tri thức với cuộc sống, bộ sách dùng thống nhất toàn quốc từ năm học 2026 đến 2027. Hệ thống có bài kiểm tra đầu vào thích ứng (CAT), hồ sơ năng lực từng chủ đề, cây tri thức, lộ trình học theo ngày và luyện tập có lặp lại ngắt quãng.

Viết bằng **HTML + CSS + JavaScript thuần**. Không framework, không bundler, **không có bước build** — Firebase được nạp qua bản `compat` chạy thẳng bằng thẻ `<script>`.

- 1 472 câu hỏi trắc nghiệm biên soạn mới, phủ 92 chủ đề Toán lớp 6, 7, 8, 9, kèm 92 mục lý thuyết. Mỗi chủ đề có câu hỏi ở bốn mức Nhận biết, Thông hiểu, Vận dụng và Vận dụng cao.
- **Nhiệm vụ số** (`#/digital-tasks`): 9 nhiệm vụ phát triển năng lực số theo 5 biện pháp của đề án (Ví dụ 4.1 → 4.9) — kiểm chứng lời giải số, phiếu tự theo dõi, hợp tác nhóm, sản phẩm số; có mức hỗ trợ thích ứng, chấm tự động và phiếu học tập lưu trên máy
- Thuật toán: IRT 3PL, CAT theo thang N→H→V→T, Bayesian Knowledge Tracing, SM-2
- **Đăng nhập bằng Firebase Auth**, hai vai trò: học sinh và quản trị
- Tiến trình học đồng bộ lên Firestore theo tài khoản — đăng nhập máy nào cũng thấy

---

## 1. Chạy trên máy

⚠️ **Phải chạy qua web server, không mở bằng `file://`.** Firebase Auth từ chối origin `null`, nên nháy đúp `index.html` sẽ không đăng nhập được.

```bash
python -m http.server 8080     # hoặc: npx serve .
```

Rồi mở `http://localhost:8080`. `localhost` đã nằm sẵn trong danh sách domain được Firebase cho phép.

**Cần kết nối mạng** để tải Firebase SDK, KaTeX và font từ CDN.

---

## 2. Thiết lập Firebase (làm một lần)

Project mặc định: **`adaptivemath-36726`** (khai báo trong `.firebaserc`, cấu hình nằm trong `js/core/firebaseClient.js`).

### 2.1. Bật đăng nhập Email/Password

Firebase Console → **Authentication** → *Get started* → tab **Sign-in method** → bật **Email/Password**.

### 2.2. Bật Firestore

Firebase Console → **Firestore Database** → *Create database* → chọn vùng `asia-southeast1` (Singapore) → chế độ **production**.

### 2.3. Nạp security rules — **bắt buộc**

Mở **Firestore Database → Rules**, dán toàn bộ nội dung file `firestore.rules` trong dự án vào, bấm **Publish**.

Nếu quen dùng CLI thì có thể chạy `firebase deploy --only firestore:rules` (file `firebase.json` đã cấu hình sẵn).

Không có bước này thì hoặc là mọi thao tác bị từ chối, hoặc (nếu bạn để chế độ test) ai cũng đọc được dữ liệu của người khác.

### 2.4. Cho phép tên miền

Firebase Console → **Authentication → Settings → Authorized domains** → **Add domain** → thêm tên miền Cloudflare của bạn, ví dụ `adaptivemath.pages.dev`.

`localhost` đã có sẵn, không cần thêm.

### 2.5. Tạo tài khoản quản trị

Học sinh và giáo viên tự chọn vai trò ngay ở màn hình đăng ký. Riêng **admin** thì không: không có "mật khẩu admin" nào nằm trong mã nguồn — **bất cứ gì gửi xuống trình duyệt đều đọc được bằng F12**, nên một mật khẩu cứng trong JavaScript chỉ là trang trí. Thay vào đó admin là một tài khoản thật:

1. Mở web, bấm **Đăng ký**, tạo tài khoản bằng email quản trị của bạn (mật khẩu riêng, do bạn đặt).
2. Vào Firebase Console → **Firestore Database** → collection `users` → mở document có `email` trùng email vừa đăng ký.
3. Sửa trường `role` từ `student` thành `admin` → **Update**.
4. Đăng xuất rồi đăng nhập lại. Thanh bên sẽ xuất hiện mục **Quản trị**.

Rules chặn mọi tài khoản tự đổi `role` của mình sau khi đã tạo, nên đây là cách duy nhất để cấp quyền admin.

### 2.6. Xoá sạch tài khoản cũ (chỉ làm khi chuyển sang bản có vai trò)

Tài khoản tạo từ bản cũ không có trường `role` mà rules mới hiểu, và cũng không có cách nào chọn lại vai trò. Trước khi mở đăng ký, hãy xoá sạch:

```bash
cd tools
npm install firebase-admin
# Tải service-account.json: Firebase Console → Project settings
#   → Service accounts → Generate new private key → lưu vào tools/

node reset-accounts.js                            # chạy thử, chỉ liệt kê
node reset-accounts.js --yes-delete-everything    # xoá thật
```

Script xoá **toàn bộ** user trong Authentication cùng ba collection `users`, `learners`, `classes`. Không có bước hoàn tác. Khoá `service-account.json` bỏ qua mọi security rules — đã nằm trong `.gitignore`, và nên xoá khỏi máy khi dùng xong.

---

## 3. Đăng nhập và phân quyền hoạt động thế nào

Ba vai trò. Học sinh và giáo viên chọn khi đăng ký; admin cấp thủ công (mục 2.5).

| | Học sinh | Giáo viên | Quản trị |
|---|---|---|---|
| Học, làm bài, xem hồ sơ năng lực | ✅ | ❌ | ✅ |
| Đọc dữ liệu học của chính mình | ✅ | — | ✅ |
| Tạo lớp, sinh mã lớp | ❌ | ✅ | ❌ |
| Vào lớp bằng mã | ✅ | ❌ | ❌ |
| Xem tiến độ học sinh **trong lớp mình** | ❌ | ✅ | ✅ |
| Xem toàn bộ tài khoản trong hệ thống | ❌ | ❌ | ✅ |
| Đọc bài làm chi tiết của người khác | ❌ | ❌ | ❌ |
| Tự đổi vai trò của mình | ❌ | ❌ | ❌ |

**Giáo viên chỉ thấy học sinh đã tự nhập mã lớp của mình** — không có cách nào liệt kê học sinh ngoài lớp. Đây là lý do mã lớp được dùng làm *document id* của lớp: học sinh vào lớp bằng một lệnh đọc trực tiếp `classes/{MÃ}`, nên không cần cấp quyền liệt kê collection `classes` cho ai cả (nếu cấp, mọi mã lớp trong hệ thống sẽ lộ).

**Đánh đổi cần nói thẳng:** vai trò giáo viên là tự khai. Không có gì ngăn một người đăng ký làm giáo viên. Thứ được đảm bảo là *phạm vi*: một "giáo viên" như vậy vẫn không chạm được tới bất kỳ học sinh nào chưa nhập mã lớp của họ. Nếu trường cần chặt hơn, hãy đổi rule `create` của `users/{uid}` thành chỉ cho `'student'`, rồi nâng vai trò giáo viên bằng tay như admin.

**Điểm quan trọng:** phần kiểm tra vai trò trong JavaScript chỉ để quyết định vẽ menu nào. Thứ thật sự chặn là `firestore.rules` chạy trên máy chủ Google — một học sinh sửa mã trong DevTools vẫn không đọc được danh sách lớp, vì chính câu truy vấn bị từ chối.

**Đăng xuất sẽ xoá dữ liệu học trên máy này** (đã đẩy lên mây trước đó). Điều này là cố ý: máy tính dùng chung ở trường không được để người sau thấy kết quả của người trước.

---

## 4. Mô hình dữ liệu Firestore

```
users/{uid}
  ├─ email, displayName, role: 'student' | 'teacher' | 'admin'
  ├─ classCode, className          ← lớp học sinh đang tham gia (null nếu chưa)
  ├─ grade, goal, dailyMinutes, hasDiagnostic
  ├─ xp, level, currentStreak, masteredTopics, totalQuestions…   ← tóm tắt tiến độ
  └─ createdAt, lastLoginAt, lastActiveAt

learners/{uid}/data/{profile | diagnostic | learner | path}
  └─ { json: "<chuỗi JSON>", updatedAt: <ms> }

classes/{MÃ}                        ← document id CHÍNH LÀ mã tham gia, vd K7M2QX
  └─ name, teacherId, teacherName, createdAt

classes/{MÃ}/members/{uid}
  ├─ uid, displayName, email, joinedAt
  ├─ xp, level, masteredTopics, totalQuestions…   ← bản sao tóm tắt tiến độ
  └─ help: { message, status, askedAt, reply }    ← yêu cầu hỗ trợ (nếu có)
```

Ba quyết định thiết kế đáng nói:

- **Mã lớp làm document id.** Học sinh vào lớp bằng `get(classes/K7M2QX)` — một lệnh đọc đúng đường dẫn đã biết — thay vì truy vấn `where('code','==',…)`. Truy vấn kiểu đó buộc phải mở quyền liệt kê `classes`, đồng nghĩa phát tán mọi mã lớp. Bảng chữ cái sinh mã bỏ `0/O` và `1/I/L` vì mã được đọc từ bảng và gõ lại bởi cả lớp.
- **Tiến độ được nhân bản sang `classes/{MÃ}/members/{uid}`.** Firestore không có phép JOIN. Cách còn lại là cho giáo viên quyền đọc mọi document `users`, tức là nhiều quyền hơn hẳn nhu cầu "theo dõi lớp của tôi". Học sinh tự ghi bản sao này mỗi lần đồng bộ (`core/sync.js` → `auth.updateSummary`).
- **Tóm tắt tiến độ được lưu lặp trên `users/{uid}`.** Nhờ vậy trang quản trị chỉ cần **một** truy vấn cho cả lớp, thay vì mở dữ liệu của từng học sinh — vừa nhanh vừa không cần quyền đọc bài làm của ai.
- **Bốn khối dữ liệu lưu dạng chuỗi JSON**, mỗi khối một document. Firestore không nhận `undefined` và cấm mảng lồng mảng; chuỗi JSON tránh cả hai, đồng thời giới hạn 1 MB áp cho từng khối chứ không phải cả cụm.

Xung đột được xử lý theo **last-write-wins theo từng khối**, so bằng mốc thời gian mili-giây. Đây không phải hợp nhất: hai thiết bị sửa cùng một khối thì bên lưu sau thắng. Với một học sinh chuyển giữa điện thoại và máy tính của chính mình, đó là hành vi trung thực và dễ đoán.

---

## 5. Deploy lên Cloudflare Pages

Dự án là site tĩnh nên **không cần build command**. Có hai cách.

### Cách A — Kéo thả (nhanh nhất, không cần GitHub)

1. Vào <https://dash.cloudflare.com> → **Workers & Pages** → **Create** → tab **Pages** → **Upload assets**.
2. Đặt tên project, ví dụ `adaptivemath`.
3. Kéo **toàn bộ thư mục dự án** vào (hoặc nén thành `.zip` rồi thả vào).
4. Bấm **Deploy site**.

Vài chục giây sau bạn có link dạng `https://adaptivemath.pages.dev`.

### Cách B — Kết nối GitHub (tự động deploy mỗi lần push)

```bash
git init
git add .
git commit -m "AdaptiveMath - bản HTML/CSS/JS thuần"
git branch -M main
git remote add origin https://github.com/<tài-khoản>/<tên-repo>.git
git push -u origin main
```

Rồi trong Cloudflare: **Workers & Pages** → **Create** → **Pages** → **Connect to Git** → chọn repo, và điền:

| Trường | Giá trị |
|---|---|
| Framework preset | **None** |
| Build command | *(để trống)* |
| Build output directory | `/` |
| Root directory | *(để trống)* |

Bấm **Save and Deploy**.

### ⚠️ Mỗi lần sửa file .js hoặc .css: nhớ tăng `?v=`

Trong `index.html`, mọi file cục bộ được nạp kèm chuỗi phiên bản:

```html
<script src="js/core/store.js?v=4"></script>
```

**Sửa code xong thì tăng số đó lên** (Ctrl+H, thay tất cả `?v=4` → `?v=5`) rồi mới deploy.

Vì sao bắt buộc: tên file không kèm mã băm nội dung (dự án không có bước build để tạo mã băm), nên trình duyệt đã lưu bản cũ sẽ tiếp tục dùng bản cũ. Nguy hiểm ở chỗ nó **trộn lẫn phiên bản** — một lần `sync.js` mới đứng cạnh `store.js` cũ đã làm cả app chết với lỗi `AM.store.onChange is not a function`. `index.html` luôn được tải mới (`Cache-Control: no-cache`), nên chỉ cần đổi chuỗi này là mọi file phụ thuộc bị tải lại.

### Ghi chú

- File `_headers` đã cấu hình sẵn cache và vài header bảo mật cơ bản.
- **Không có `_redirects`, và đó là cố ý:** app dùng hash routing (`#/profile`), nên mọi request HTTP đều trỏ tới `/` hoặc một file có thật. Một quy tắc catch-all chỉ che mất lỗi 404 thật — `data/questions.js` mà thiếu sẽ trả về HTML giả dạng JavaScript, rất khó dò.
- Dự án nặng ~3,2 MB / 38 file, thừa sức nằm trong hạn mức miễn phí của Cloudflare Pages (25 MB mỗi file, 20.000 file).
- **Sau khi deploy, nhớ thêm tên miền `.pages.dev` vào Authorized domains** (mục 2.4) — nếu không, đăng nhập sẽ báo lỗi `auth/unauthorized-domain`.

---

## 6. Cấu trúc

```
.
├── index.html               # Trang duy nhất — nạp toàn bộ script theo thứ tự
├── _selftest.html           # 95 phép tự kiểm tra logic — mở /_selftest.html
├── _fonttest.html           # 17 phép kiểm tra phông chữ — mở /_fonttest.html
├── _authtest.html           # 14 phép kiểm đăng ký & vai trò — mở /_authtest.html
├── _headers                 # Cấu hình HTTP cho Cloudflare Pages
├── firestore.rules          # Phân quyền — DÁN VÀO FIREBASE CONSOLE
├── firebase.json            # Chỉ để deploy rules bằng CLI (site chạy ở Cloudflare)
├── css/app.css              # Toàn bộ giao diện
├── data/questions.js        # 6 205 câu hỏi + lý thuyết 39 bài (~9 MB)
├── data/examples.js         # 9 nhiệm vụ số (Ví dụ 4.1→4.9 của chương 4 đề án)
├── docs/design/             # Tài liệu thiết kế (tham khảo cho báo cáo đề án)
├── tools/reset-accounts.js  # Xoá sạch tài khoản + dữ liệu (Firebase Admin SDK)
└── js/
    ├── core/                # Logic thuần — không đụng tới DOM
    │   ├── util.js          # Helper DOM, ngày tháng, RNG có seed
    │   ├── constants.js     # CAT_CONFIG, mastery band, XP, huy hiệu…
    │   ├── topics.js        # 92 chủ đề Toán THCS lớp 6, 7, 8, 9
    │   ├── store.js         # localStorage + mốc thời gian cho đồng bộ
    │   ├── firebaseClient.js# Khởi tạo Firebase, dịch mã lỗi sang tiếng Việt
    │   ├── auth.js          # Đăng ký / đăng nhập / đăng xuất / vai trò
    │   ├── sync.js          # Kéo–đẩy 4 khối dữ liệu lên Firestore
    │   ├── classroom.js     # Lớp học: tạo lớp, mã tham gia, roster, hỗ trợ
    │   ├── questionBank.js  # Truy cập ngân hàng câu hỏi
    │   ├── latex.js         # Render LaTeX + bảng, qua KaTeX
    │   ├── irt.js           # IRT 3PL, ước lượng θ bằng MAP
    │   ├── cat.js           # Bộ chọn câu hỏi theo thang N→H→V→T
    │   ├── bkt.js           # Bayesian Knowledge Tracing
    │   ├── srs.js           # Lặp lại ngắt quãng SM-2
    │   ├── adaptiveEngine.js# Phát hiện frustration / boredom / flow
    │   ├── profiling.js     # Dựng hồ sơ năng lực
    │   ├── treeStability.js # Cây tri thức + độ vững
    │   ├── practiceSelector.js
    │   ├── pathGenerator.js # Sinh lộ trình theo ngày/tuần
    │   └── todayActivities.js
    ├── components.js        # Khung trang, chip người dùng, render câu hỏi
    ├── views/               # 13 trang (landing, login, admin, teacher,
    │                        #   classroom + 8 trang học)
    ├── router.js            # Router theo hash + chặn route theo vai trò
    ├── boot-guard.js        # Bắt lỗi khởi động và hiện màn hình chẩn đoán
    └── app.js               # Điểm khởi động
```

---

## 7. Luồng hoạt động

```
Khách vãng lai          Học sinh                          Giáo viên
───────────────         ──────────────────────────────    ────────────────────
#/  landing page  ──→   #/onboarding → #/diagnostic       #/teacher
     ↓ CTA                 8 bước       CAT 30-50 câu       danh sách lớp
#/login                         ↓                             ↓
 chọn vai trò           #/profile → #/learning-path       #/teacher?class=MÃ
 → học sinh                θ+mastery   sprint theo ngày     roster + tiến độ
 → giáo viên                    ↓                           + trả lời hỗ trợ
                        #/practice → #/theory → #/errors
                            BKT + SRS
                        #/classroom  ← vào lớp bằng mã, xin hỗ trợ
```

*Mọi đường dẫn khác khi chưa đăng nhập đều đưa về landing page — đây là hành vi cố ý, xem `resolveView()` trong `js/router.js`.*

0. **Landing page** — khách chưa đăng nhập luôn thấy trang giới thiệu trước, không phải một ô mật khẩu trống trơn. Trang cố tình ngắn: một lời hứa, một ảnh minh hoạ kết quả, ba ý mỗi ý một dòng, ba bước. Nút "Bắt đầu miễn phí" mở thẳng chế độ đăng ký.
1. **Đăng nhập / đăng ký** — bắt buộc để vào phần học. Khi đăng ký phải chọn vai trò **học sinh** hay **giáo viên**; vai trò không đổi được sau đó. Sau khi đăng nhập, hệ thống kéo dữ liệu của tài khoản về máy rồi mới dựng giao diện.
1. **Onboarding** — thu thập lớp, mục tiêu, thời gian/ngày, hạn thi, tự đánh giá, chủ đề yếu.
2. **Kiểm tra đầu vào (CAT)** — mỗi chủ đề leo thang Nhận biết → Thông hiểu → Vận dụng. Đúng thì lên mức, sai thì có một câu xác minh rồi mới kết luận. Ước lượng θ bằng IRT 3PL sau mỗi câu.
3. **Hồ sơ năng lực** — mastery mỗi chủ đề = `độ tin cậy × quan sát + (1 − độ tin cậy) × kỳ vọng(θ)`, kèm radar theo chương, danh sách điểm yếu, tín hiệu lỗi và cây tri thức 4 giai đoạn.
4. **Lộ trình học** — ưu tiên theo `0.30·gap + 0.20·độ gấp + 0.20·độ mong manh + 0.15·mật độ đề thi + 0.15·tự đánh dấu yếu`, đóng gói vào từng ngày vừa quỹ thời gian, chèn ngày ôn tập.
5. **Luyện tập** — 3 pha (khởi động → luyện → kiểm tra nhanh). Kết thúc: cập nhật BKT, lên lịch SRS, ghi sổ tay lỗi, cộng XP/streak/huy hiệu.
6. **Sổ tay lỗi sai** — tự đánh dấu đã sửa khi bạn làm đúng lại chính câu đó.
7. **Lớp học** — học sinh nhập mã lớp, hệ thống hỏi xác nhận ("Lớp 8A1 — cô Hoa. Vào lớp?") rồi mới cho vào; mã gõ nhầm mà tình cờ tồn tại sẽ không lặng lẽ đẩy học sinh vào lớp lạ. Sau khi vào lớp, học sinh gửi được yêu cầu hỗ trợ và thấy câu trả lời của giáo viên ngay tại đây. Mỗi học sinh chỉ ở một lớp: vào lớp mới thì tự rời lớp cũ.
8. **Giáo viên** — tạo lớp (hệ thống sinh mã 6 ký tự), xem roster kèm tiến độ, sắp xếp theo "cần hỗ trợ trước" để tìm nhanh em đang vướng, trả lời yêu cầu hỗ trợ, xoá học sinh khỏi lớp hoặc xoá cả lớp. Tài khoản giáo viên không có phần học riêng — mọi route học tập đều đưa về danh sách lớp.

---

## 8. Dữ liệu trên máy

localStorage vẫn là nguồn đọc/ghi chính khi đang học (nhanh, chạy được cả lúc mạng chập chờn); Firestore là bản sao đồng bộ.

| Key | Nội dung |
|---|---|
| `kntt.profile.v1` | Hồ sơ onboarding |
| `kntt.diagnostic.v1` | Phiên kiểm tra đầu vào |
| `kntt.learner.v1` | BKT, SRS, lỗi sai, XP, huy hiệu, lịch sử |
| `kntt.learningPath.v1` | Lộ trình đã sinh |
| `kntt.sync.v1` | Mốc thời gian sửa đổi từng khối |
| `kntt.sync.owner` | Tài khoản đang sở hữu dữ liệu trên máy này |

Mỗi lần lưu, khối tương ứng được đẩy lên Firestore sau ~1,5 giây (gộp nhiều thay đổi liên tiếp thành một lần ghi).

Nút 🔄 ở góc trên trang chính xoá sạch mọi thứ — **cả trên máy lẫn trên tài khoản**. Nút đăng xuất chỉ xoá bản sao trên máy.

---

## 9. Hạn chế đã biết

Ghi lại trung thực để tiện đưa vào báo cáo đề án:

- **Chưa có test tự động.** Toàn bộ logic là hàm thuần nên rất dễ viết unit test — đây là việc đáng làm tiếp theo.
- **Ngân hàng câu hỏi THCS hiện được cân theo chủ đề.** Mỗi chủ đề có 16 câu ở bốn mức độ; cần tiếp tục kiểm định thực nghiệm để hiệu chỉnh độ khó IRT theo dữ liệu học sinh thật.
- **Chưa có câu mức T (Vận dụng cao).** Phân bố hiện tại: N=239, H=440, V=188. Do đó thang N→H→V→T không bao giờ chạm bậc T, và θ của học sinh giỏi bị chặn trần vì `b` tối đa chỉ 0,5.
- **Hình vẽ TikZ** hiển thị dạng nhãn "📐 Hình vẽ (xem trong SGK)" — bản gốc cần một bước dựng SVG offline bằng LaTeX, không có trong bản này.
- **Độ tin cậy của mastery.** `confidence = min(1, số lượt / 5)`, mà một phiên chẩn đoán tối đa 50 câu chia cho 15–20 chủ đề, nên phần lớn điểm mastery vẫn dựa vào kỳ vọng từ θ nhiều hơn là quan sát trực tiếp.
- **Không mở được bằng `file://` nữa.** Firebase Auth từ chối origin `null`, nên phải chạy qua `localhost` hoặc bản đã deploy.
- **Đồng bộ là last-write-wins, không hợp nhất.** Mở app trên hai thiết bị cùng lúc thì bên lưu sau ghi đè bên kia trong cùng một khối dữ liệu.
- **Admin và giáo viên chưa xem được chi tiết bài làm** của từng học sinh, chỉ xem tóm tắt tiến độ. Muốn mở thêm thì sửa quy tắc `learners/{uid}/data/{key}` trong `firestore.rules` thành `isSelf(uid) || isAdmin()` rồi viết trang chi tiết.
- **Vai trò giáo viên là tự khai.** Ai cũng đăng ký làm giáo viên được. Phạm vi vẫn bị giới hạn chặt (chỉ thấy học sinh đã nhập mã lớp của mình), nhưng nếu trường cần siết, xem cách xử lý ở cuối mục 3.
- **Mã lớp không hết hạn và không giới hạn số lần dùng.** Mã bị chia sẻ ra ngoài thì người lạ vào lớp được; giáo viên phải tự xoá em đó khỏi roster. Muốn chặt hơn thì thêm cờ `open: false` vào document lớp và kiểm trong rule `create` của `members`.
- **Ngân hàng câu hỏi từng bị hỏng mã ký tự** (UTF-8 bị đọc nhầm thành cp1252 khi dựng corpus, làm "mệnh đề" hiện thành "má»‡nh Ä‘á»"). Đã sửa toàn bộ 4 830 chuỗi bằng `tools/` và kiểm lại 0 lỗi trên cả 891 câu. Bản gốc còn ở `data/questions.js.mojibake-backup` (đã bị `.gitignore` bỏ qua) — xoá được khi đã yên tâm.
- **Chưa có xác minh email**, nên ai cũng đăng ký được bằng địa chỉ bất kỳ. Bật *Email verification* trong Firebase Console nếu muốn siết lại.

---

## 10. Kiểm thử

Dự án có ba bộ tự kiểm tra, mở thẳng bằng trình duyệt:

### `/_selftest.html` — 95 phép kiểm logic

Nạp toàn bộ module rồi in kết quả PASS/FAIL:

- 23 module và 13 trang đều đăng ký đúng, và **mọi trang đều render ra DOM thật**
- IRT: xác suất tăng theo θ; toàn đúng đẩy θ lên, toàn sai kéo θ xuống
- CAT: chạy trọn một phiên mô phỏng — dừng đúng lúc, **phủ đủ 20/20 chủ đề**, không lặp câu
- Chấm điểm MCQ / Đúng-Sai (kể cả điểm từng phần)
- Hồ sơ năng lực: mastery luôn nằm trong [0,1], gộp chương đúng
- Cây tri thức: tổng số chủ đề theo giai đoạn khớp
- Lộ trình: **không ngày nào vượt quỹ thời gian**, không trùng mã hoạt động
- BKT tăng khi đúng và đạt ngưỡng thành thạo sau chuỗi đúng; SM-2 giãn khoảng ôn và reset khi trượt
- Render LaTeX cho **200 câu hỏi thật** không văng lỗi, bảng `tabular` ra đúng HTML

Trang này sao lưu `localStorage` trước khi chạy và khôi phục sau đó, nên mở lúc đang đăng nhập cũng không mất dữ liệu.

### `/_fonttest.html` — 17 phép kiểm phông chữ

Trang dùng **hai** font, tách theo nhiệm vụ: **Be Vietnam Pro** cho mọi thứ để đọc (đề bài, lý thuyết, nhãn, nút), **Baloo 2** chỉ cho tiêu đề và logo. Baloo 2 là font hiển thị bo tròn — đẹp ở cỡ 2rem, nhưng đọc cả đoạn dài thì mỏi mắt, và đó chính là phản hồi "chữ nhức mắt" của người dùng.

Kiểm đúng những chỗ hay hỏng phông:

- Cả hai font tải đủ nét (Be Vietnam Pro 400–700, Baloo 2 600–800), nét đậm nhất **thật sự khác** nét nhẹ nhất (không phải trình duyệt tự bôi đậm)
- Hai font thực sự khác nhau — nếu trùng bề rộng nghĩa là một trong hai chưa tải
- Chữ tiếng Việt có dấu do chính font vẽ, **không bị thay thế từng ký tự** bằng font dự phòng
- Đúng font đúng chỗ: `body` và đề bài dùng Be Vietnam Pro, tiêu đề dùng Baloo 2
- Biểu tượng Material Symbols **không** dính font chữ (nếu dính sẽ hiện chữ "home", "logout" thay vì icon)
- `code` giữ monospace, ô nhập liệu dùng đúng font thân trang
- **Công thức KaTeX giữ font toán riêng**, không bị font giao diện tràn vào
- Giãn dòng thân trang ≥ 1,6 và đề bài ≥ 1,7 — chốt lại phần sửa "chữ nhức mắt" để một lần sửa CSS sau này không lặng lẽ làm hỏng

### `/_authtest.html` — 14 phép kiểm đăng ký & vai trò

Chạy `register()` trên một Firebase giả, mô phỏng đúng thời điểm từng làm hỏng nó.

**Lỗi được chốt lại ở đây:** `createUserWithEmailAndPassword()` đăng nhập tài khoản mới **ngay lập tức**, nên `onAuthStateChanged` chạy trong lúc `register()` còn đang chờ `updateProfile()`. Listener chạm tới `users/{uid}` trước, không thấy document nên tự tạo một cái với `role` đoán mò là `'student'`. Đến lượt `register()` ghi `role: 'teacher'` thì đó đã thành một *update đổi vai trò* — và `firestore.rules` từ chối thẳng. **Mọi tài khoản giáo viên đều lặng lẽ ra học sinh.**

Firebase giả trong test có thực thi đúng điều khoản `request.resource.data.role == resource.data.role`, nên nếu ai đó lỡ tay bỏ fix, test chuyển sang FAIL chứ không im lặng.

Kiểm:

- Đăng ký giáo viên ra đúng giáo viên — trong Firestore, trong bộ nhớ, và qua `isTeacher()`
- **Không lệnh ghi nào bị rules từ chối** trong suốt quá trình đăng ký
- Họ tên đã nhập không bị mất, dù `updateProfile()` về sau
- Đăng ký học sinh vẫn ra học sinh, và học sinh không có quyền giáo viên
- Client bị sửa mà khai `role: 'admin'` (hoặc rác) đều bị hạ xuống `student`
- Đăng ký lỗi giữa chừng không để lại vai trò rớt sang tài khoản đăng ký kế tiếp

**Kết quả lần chạy gần nhất: 80 + 17 + 14 PASS, 0 FAIL** (Chrome headless, phục vụ qua HTTP).

Phần chưa kiểm chứng được: màn hình cảnh báo khi mở bằng `file://` — Chrome headless chặn điều hướng tới `file://` nên không dựng lại được tình huống đó.

Nếu gặp lỗi khi chạy, ứng dụng sẽ tự hiện màn hình chẩn đoán liệt kê lỗi và tình trạng từng thành phần. Chi tiết hơn thì mở **DevTools → Console** (F12); mã là JavaScript thuần không qua biên dịch nên thông báo lỗi trỏ thẳng vào file và dòng thật.

Vài lỗi hay gặp lúc mới thiết lập:

| Thông báo | Nguyên nhân |
|---|---|
| `auth/operation-not-allowed` | Chưa bật Email/Password (mục 2.1) |
| `auth/unauthorized-domain` | Chưa thêm tên miền vào Authorized domains (mục 2.4) |
| `permission-denied` | Chưa nạp `firestore.rules` (mục 2.3) |
| `failed-precondition` | Chưa tạo Firestore database (mục 2.2) |
