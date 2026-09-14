/**
 * AdaptiveMath THCS topic map.
 * Biên soạn theo Chương trình GDPT 2018 và bộ SGK
 * Kết nối tri thức với cuộc sống dùng thống nhất toàn quốc từ năm học 2026-2027.
 */
(function (AM) {
  'use strict';
  const RAW = [
    ["6-C1-B1", 6, 1, 1, "Tập hợp và phần tử của tập hợp", "Tập hợp các số tự nhiên"],
    ["6-C1-B2", 6, 1, 2, "Số tự nhiên và thứ tự trong tập số tự nhiên", "Tập hợp các số tự nhiên"],
    ["6-C1-B3", 6, 1, 3, "Phép cộng, trừ, nhân, chia số tự nhiên", "Tập hợp các số tự nhiên"],
    ["6-C1-B4", 6, 1, 4, "Lũy thừa với số mũ tự nhiên", "Tập hợp các số tự nhiên"],
    ["6-C1-B5", 6, 2, 1, "Quan hệ chia hết và dấu hiệu chia hết", "Tính chia hết trong tập hợp các số tự nhiên"],
    ["6-C1-B6", 6, 2, 2, "Số nguyên tố, hợp số và phân tích ra thừa số nguyên tố", "Tính chia hết trong tập hợp các số tự nhiên"],
    ["6-C1-B7", 6, 2, 3, "Ước chung, bội chung, ƯCLN và BCNN", "Tính chia hết trong tập hợp các số tự nhiên"],
    ["6-C2-B1", 6, 3, 1, "Số nguyên và trục số", "Số nguyên"],
    ["6-C2-B2", 6, 3, 2, "Phép cộng và phép trừ số nguyên", "Số nguyên"],
    ["6-C2-B3", 6, 3, 3, "Phép nhân và phép chia số nguyên", "Số nguyên"],
    ["6-C4-B1", 6, 4, 1, "Tam giác đều, hình vuông và lục giác đều", "Một số hình phẳng trong thực tiễn"],
    ["6-C4-B2", 6, 4, 2, "Hình chữ nhật, hình thoi, hình bình hành và hình thang cân", "Một số hình phẳng trong thực tiễn"],
    ["6-C4-B3", 6, 4, 3, "Chu vi và diện tích các hình cơ bản", "Một số hình phẳng trong thực tiễn"],
    ["6-C4-B4", 6, 5, 1, "Đối xứng trục và đối xứng tâm", "Tính đối xứng của hình phẳng trong tự nhiên"],
    ["6-C3-B1", 6, 6, 1, "Phân số và tính chất cơ bản của phân số", "Phân số"],
    ["6-C3-B2", 6, 6, 2, "Phép tính với phân số", "Phân số"],
    ["6-C3-B3", 6, 7, 1, "Số thập phân và phép tính", "Số thập phân"],
    ["6-C3-B4", 6, 7, 2, "Tỉ số và tỉ số phần trăm", "Số thập phân"],
    ["6-C5-B1", 6, 8, 1, "Điểm, đường thẳng, tia, đoạn thẳng và trung điểm", "Những hình hình học cơ bản"],
    ["6-C5-B2", 6, 8, 2, "Góc và số đo góc", "Những hình hình học cơ bản"],
    ["6-C6-B1", 6, 9, 1, "Thu thập dữ liệu, bảng và biểu đồ", "Dữ liệu và xác suất thực nghiệm"],
    ["6-C6-B2", 6, 9, 2, "Xác suất thực nghiệm", "Dữ liệu và xác suất thực nghiệm"],
    ["7-C1-B1", 7, 1, 1, "Số hữu tỉ và biểu diễn số hữu tỉ", "Số hữu tỉ"],
    ["7-C1-B2", 7, 1, 2, "Phép tính với số hữu tỉ", "Số hữu tỉ"],
    ["7-C1-B3", 7, 1, 3, "Lũy thừa của số hữu tỉ và thứ tự thực hiện phép tính", "Số hữu tỉ"],
    ["7-C1-B4", 7, 2, 1, "Số vô tỉ, căn bậc hai số học và số thực", "Số thực"],
    ["7-C1-B5", 7, 2, 2, "Làm tròn số và ước lượng", "Số thực"],
    ["7-C4-B1", 7, 3, 1, "Góc ở vị trí đặc biệt và tia phân giác", "Góc và đường thẳng song song"],
    ["7-C4-B2", 7, 3, 2, "Hai đường thẳng song song", "Góc và đường thẳng song song"],
    ["7-C5-B1", 7, 4, 1, "Tổng các góc trong một tam giác", "Tam giác bằng nhau"],
    ["7-C5-B2", 7, 4, 2, "Hai tam giác bằng nhau", "Tam giác bằng nhau"],
    ["7-C5-B3", 7, 4, 3, "Tam giác cân và đường trung trực", "Tam giác bằng nhau"],
    ["7-C6-B1", 7, 5, 1, "Thu thập và biểu diễn dữ liệu", "Thu thập và biểu diễn dữ liệu"],
    ["7-C6-B2", 7, 5, 2, "Phân tích dữ liệu và biểu đồ", "Thu thập và biểu diễn dữ liệu"],
    ["7-C2-B1", 7, 6, 1, "Tỉ lệ thức và dãy tỉ số bằng nhau", "Tỉ lệ thức và đại lượng tỉ lệ"],
    ["7-C2-B2", 7, 6, 2, "Đại lượng tỉ lệ thuận", "Tỉ lệ thức và đại lượng tỉ lệ"],
    ["7-C2-B3", 7, 6, 3, "Đại lượng tỉ lệ nghịch", "Tỉ lệ thức và đại lượng tỉ lệ"],
    ["7-C3-B1", 7, 7, 1, "Biểu thức đại số", "Biểu thức đại số và đa thức một biến"],
    ["7-C3-B2", 7, 7, 2, "Đa thức một biến", "Biểu thức đại số và đa thức một biến"],
    ["7-C6-B3", 7, 8, 1, "Biến cố và xác suất", "Làm quen với biến cố và xác suất của biến cố"],
    ["7-C5-B4", 7, 9, 1, "Quan hệ giữa cạnh và góc trong tam giác", "Quan hệ giữa các yếu tố trong một tam giác"],
    ["7-C5-B5", 7, 9, 2, "Quan hệ đường vuông góc và đường xiên", "Quan hệ giữa các yếu tố trong một tam giác"],
    ["7-C5-B6", 7, 9, 3, "Các đường đồng quy của tam giác", "Quan hệ giữa các yếu tố trong một tam giác"],
    ["7-C10-B1", 7, 10, 1, "Hình hộp chữ nhật và hình lập phương", "Một số hình khối trong thực tiễn"],
    ["7-C10-B2", 7, 10, 2, "Hình lăng trụ đứng tam giác và hình lăng trụ đứng tứ giác", "Một số hình khối trong thực tiễn"],
    ["8-C1-B1", 8, 1, 1, "Đơn thức", "Đa thức"],
    ["8-C1-B2", 8, 1, 2, "Đa thức", "Đa thức"],
    ["8-C1-B3", 8, 1, 3, "Phép cộng và phép trừ đa thức", "Đa thức"],
    ["8-C1-B4", 8, 1, 4, "Phép nhân và phép chia đa thức", "Đa thức"],
    ["8-C2-B1", 8, 2, 1, "Hằng đẳng thức đáng nhớ", "Hằng đẳng thức đáng nhớ và ứng dụng"],
    ["8-C2-B2", 8, 2, 2, "Phân tích đa thức thành nhân tử", "Hằng đẳng thức đáng nhớ và ứng dụng"],
    ["8-C5-B1", 8, 3, 1, "Tứ giác", "Tứ giác"],
    ["8-C5-B2", 8, 3, 2, "Hình thang cân", "Tứ giác"],
    ["8-C5-B3", 8, 3, 3, "Hình bình hành", "Tứ giác"],
    ["8-C5-B4", 8, 3, 4, "Hình chữ nhật, hình thoi và hình vuông", "Tứ giác"],
    ["8-C6-B1", 8, 4, 1, "Định lí Thales trong tam giác", "Định lí Thales trong tam giác"],
    ["8-C6-B2", 8, 4, 2, "Đường trung bình của tam giác", "Định lí Thales trong tam giác"],
    ["8-C8-B1", 8, 5, 1, "Thu thập, phân loại và biểu diễn dữ liệu", "Dữ liệu và biểu đồ"],
    ["8-C3-B1", 8, 6, 1, "Phân thức đại số", "Phân thức đại số"],
    ["8-C3-B2", 8, 6, 2, "Phép toán với phân thức đại số", "Phân thức đại số"],
    ["8-C4-B1", 8, 7, 1, "Phương trình bậc nhất một ẩn", "Phương trình bậc nhất và hàm số bậc nhất"],
    ["8-C4-B2", 8, 7, 2, "Giải bài toán bằng cách lập phương trình", "Phương trình bậc nhất và hàm số bậc nhất"],
    ["8-C4-B3", 8, 7, 3, "Hàm số và đồ thị", "Phương trình bậc nhất và hàm số bậc nhất"],
    ["8-C4-B4", 8, 7, 4, "Hàm số bậc nhất và hệ số góc", "Phương trình bậc nhất và hàm số bậc nhất"],
    ["8-C8-B2", 8, 8, 1, "Xác suất của biến cố", "Mở đầu về tính xác suất của biến cố"],
    ["8-C6-B3", 8, 9, 1, "Tam giác đồng dạng", "Tam giác đồng dạng"],
    ["8-C6-B4", 8, 9, 2, "Định lí Pythagore và ứng dụng", "Tam giác đồng dạng"],
    ["8-C7-B1", 8, 10, 1, "Hình chóp tam giác đều và hình chóp tứ giác đều", "Một số hình khối trong thực tiễn"],
    ["9-C1-B2", 9, 1, 1, "Phương trình bậc nhất hai ẩn và hệ phương trình", "Phương trình và hệ hai phương trình bậc nhất hai ẩn"],
    ["9-C1-B3", 9, 1, 2, "Giải hệ hai phương trình bậc nhất hai ẩn", "Phương trình và hệ hai phương trình bậc nhất hai ẩn"],
    ["9-C1-B4", 9, 1, 3, "Giải bài toán bằng cách lập hệ phương trình", "Phương trình và hệ hai phương trình bậc nhất hai ẩn"],
    ["9-C1-B1", 9, 2, 1, "Phương trình quy về phương trình bậc nhất một ẩn", "Phương trình và bất phương trình bậc nhất một ẩn"],
    ["9-C2-B1", 9, 2, 2, "Bất đẳng thức và tính chất", "Phương trình và bất phương trình bậc nhất một ẩn"],
    ["9-C2-B2", 9, 2, 3, "Bất phương trình bậc nhất một ẩn", "Phương trình và bất phương trình bậc nhất một ẩn"],
    ["9-C3-B1", 9, 3, 1, "Căn bậc hai và căn bậc ba", "Căn bậc hai và căn bậc ba"],
    ["9-C3-B2", 9, 3, 2, "Biến đổi và phép tính với căn thức", "Căn bậc hai và căn bậc ba"],
    ["9-C4-B1", 9, 4, 1, "Tỉ số lượng giác của góc nhọn", "Hệ thức lượng trong tam giác vuông"],
    ["9-C4-B2", 9, 4, 2, "Hệ thức giữa cạnh và góc trong tam giác vuông", "Hệ thức lượng trong tam giác vuông"],
    ["9-C5-B1", 9, 5, 1, "Đường tròn và vị trí tương đối", "Đường tròn"],
    ["9-C5-B2", 9, 5, 2, "Tiếp tuyến của đường tròn", "Đường tròn"],
    ["9-C5-B3", 9, 5, 3, "Góc ở tâm, góc nội tiếp và cung", "Đường tròn"],
    ["9-C5-B4", 9, 5, 4, "Độ dài đường tròn, cung và diện tích hình quạt", "Đường tròn"],
    ["9-C6-B1", 9, 6, 1, "Hàm số $y=ax^2$ và đồ thị", "Hàm số y = ax² và phương trình bậc hai một ẩn"],
    ["9-C6-B2", 9, 6, 2, "Phương trình bậc hai một ẩn", "Hàm số y = ax² và phương trình bậc hai một ẩn"],
    ["9-C6-B3", 9, 6, 3, "Định lí Viète và ứng dụng", "Hàm số y = ax² và phương trình bậc hai một ẩn"],
    ["9-C7-B1", 9, 7, 1, "Tần số, tần số tương đối và biểu đồ", "Tần số và tần số tương đối"],
    ["9-C8-B1", 9, 8, 1, "Xác suất của biến cố", "Xác suất của biến cố trong một số mô hình xác suất đơn giản"],
    ["9-C9-B1", 9, 9, 1, "Tứ giác nội tiếp", "Đường tròn ngoại tiếp và đường tròn nội tiếp"],
    ["9-C9-B2", 9, 9, 2, "Đa giác đều và phép quay", "Đường tròn ngoại tiếp và đường tròn nội tiếp"],
    ["9-C10-B1", 9, 10, 1, "Hình trụ", "Một số hình khối trong thực tiễn"],
    ["9-C10-B2", 9, 10, 2, "Hình nón", "Một số hình khối trong thực tiễn"],
    ["9-C10-B3", 9, 10, 3, "Hình cầu", "Một số hình khối trong thực tiễn"],
  ];
  const TOPICS = RAW.map(function (r) {
    return {
      id: r[0], grade: r[1], chapter: r[2], lesson: r[3],
      title: r[4], chapterTitle: r[5], teacher: '',
      curriculum: 'GDPT 2018', series: ['KNTT']
    };
  });
  const BY_ID = new Map(TOPICS.map((t) => [t.id, t]));
  function getTopicsByGrade(grade) { return TOPICS.filter((t) => t.grade === grade); }
  function getTopicById(id) { return BY_ID.get(id) || null; }
  function groupTopicsByChapter(grade) {
    const groups = new Map();
    for (const topic of getTopicsByGrade(grade)) {
      const bucket = groups.get(topic.chapterTitle) || [];
      bucket.push(topic); groups.set(topic.chapterTitle, bucket);
    }
    return Array.from(groups.entries()).map(([chapter, topics]) => ({ chapter, topics }));
  }
  AM.topics = { TOPICS, getTopicsByGrade, getTopicById, groupTopicsByChapter };
})(window.AM);
