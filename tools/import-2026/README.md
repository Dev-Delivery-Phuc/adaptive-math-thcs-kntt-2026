# Bộ nhập ngân hàng câu hỏi 2026

Ba script Python (không cần thư viện ngoài) đã dùng để nạp các kho đề LaTeX vào
`data/questions.js` (2026-08-22):

- `DaKiemTraToan10.rar` — đề kiểm tra Toán 10 (TN / ĐS / TLN / TL)
- `HoanThanh_Lop11.rar` — ngân hàng Toán 11, 2 lần (có macro nhiễu chống sao chép — script tự lọc)
- `DuLieuLop12.rar` — Toán 12 theo chương (ĐS C1/C3/C4/C6, HH C2/C5)
- `ToanThucTe.rar` — bài toán thực tế 2026

## Cách chạy lại

1. Giải nén các file .rar vào thư mục `extract/` **nằm cạnh các script này**
   (mỗi kho một thư mục con: `extract/lop10/`, `extract/lop11/`, `extract/lop12/`,
   `extract/thucte/`, `extract/kntt/` — kntt bị bỏ qua vì đã có trong bank gốc):

   ```
   tar -xf DaKiemTraToan10.rar -C extract/lop10
   ```

2. `python parse_bank.py`  → sinh `parsed.json` (22 053 câu thô)
3. `python build_bank.py`  → ghi đè `data/questions.js`
   (giữ nguyên 891 câu gốc id `::ex-*` + lý thuyết; các câu id `::x-*` được dựng lại)
4. `python validate.py`    → kiểm tra dữ liệu đầu ra

## Những gì script xử lý

- Mã câu hỏi `%[0D1N1-1]` = [khối][Đại/Hình][chương][mức N/H/V/C][bài]-[dạng],
  đánh số chương theo sách CTST; bảng ánh xạ sang topicId KNTT nằm đầu `build_bank.py`
  (đã kiểm chứng bằng nội dung mẫu từng nhóm).
- Loại câu có hình (tikzpicture / immini / tkzTab / includegraphics) vì web chưa render hình.
- Loại câu tự luận (web không có UI chấm tự luận) và câu không có mã chủ đề.
- Lọc macro nhiễu của kho lớp 11 (chuỗi \xxxx ngẫu nhiên 3–6 chữ cái).
- Chuyển LaTeX về dạng KaTeX render được: itemchoice→a)b)c)d), \lq\lq→“”,
  \textbf→<strong>, \[..\]→$..$, colspec bảng phức tạp→{c}, v.v.
- Chuẩn hóa mức độ → IRT: N(b=-1.5) H(-0.5) V(0.5) C(1.0); c=0.25 TN, 0.0625 ĐS, 0 TLN.
- Giới hạn mỗi bài học: 45 TN + 25 ĐS + 25 TLN, ưu tiên câu có lời giải,
  câu thực tế, cân bằng N/H/V; khử trùng lặp theo đề bài.

Chủ đề mới (35 bài) được thêm vào `js/core/topics.js`; các bài này chưa có phần
lý thuyết (trang lý thuyết sẽ trống — bổ sung sau nếu cần).
