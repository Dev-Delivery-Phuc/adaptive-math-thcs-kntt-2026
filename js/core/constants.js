/**
 * All shared constants, ported from src/types/*.ts of the React build.
 * Values are unchanged — the algorithms depend on them.
 */
(function (AM) {
  'use strict';

  // ---- Onboarding options (types/user.ts) --------------------------------

  const GRADE_LABELS = { 6: 'Lớp 6', 7: 'Lớp 7', 8: 'Lớp 8', 9: 'Lớp 9' };

  const GOAL_OPTIONS = [
    {
      value: 'giua-ky',
      label: 'Ôn thi giữa kỳ',
      description: 'Tập trung kiến thức nửa học kỳ gần nhất.',
    },
    {
      value: 'cuoi-ky',
      label: 'Ôn thi cuối kỳ',
      description: 'Phủ toàn bộ chương trình học kỳ.',
    },
    {
      value: 'vao-10',
      label: 'Ôn thi vào lớp 10',
      description: 'Củng cố kiến thức THCS và luyện bài tổng hợp cho kỳ thi tuyển sinh lớp 10.',
    },
    {
      value: 'nang-cao',
      label: 'Học nâng cao / HSG',
      description: 'Tiến xa hơn chương trình chuẩn, bài khó.',
    },
  ];

  const DAILY_MINUTES_OPTIONS = [
    { value: 30, label: '30 phút', description: 'Nhẹ nhàng, duy trì nhịp học.' },
    { value: 45, label: '45 phút', description: 'Phù hợp đa số học sinh.' },
    { value: 60, label: '60 phút', description: 'Tiến độ nhanh, rõ kết quả.' },
    { value: 90, label: '90 phút', description: 'Tập trung ôn thi, cường độ cao.' },
  ];

  const SELF_LEVEL_OPTIONS = [
    {
      value: 'yeu',
      label: 'Yếu',
      description: 'Còn hổng nhiều kiến thức nền, cần bắt đầu lại từ cơ bản.',
    },
    {
      value: 'tb',
      label: 'Trung bình',
      description: 'Nắm được căn bản, nhưng chưa vững khi gặp bài khó.',
    },
    {
      value: 'kha',
      label: 'Khá',
      description: 'Làm tốt bài chuẩn, đang hướng tới mức vận dụng cao.',
    },
    {
      value: 'gioi',
      label: 'Giỏi',
      description: 'Tự tin mọi chương, muốn luyện chuyên sâu.',
    },
  ];

  // ---- CAT configuration (types/question.ts) -----------------------------

  const LADDER_ORDER = ['N', 'H', 'V', 'T'];

  const LEVEL_LABELS = {
    N: 'Nhận biết',
    H: 'Thông hiểu',
    V: 'Vận dụng',
    T: 'Vận dụng cao',
    unknown: 'Chưa phân loại',
  };

  const CAT_CONFIG = {
    minItems: 15,
    maxItems: 50,
    seThreshold: 0.35,
    sessionTimeLimitMs: 60 * 60 * 1000,
    topicCapRatio: 0.3,
    minPerQuestionSeconds: 90,
    maxPerQuestionSeconds: 180,
    thetaMin: -4,
    thetaMax: 4,
  };

  // ---- Mastery bands (types/profile.ts) ----------------------------------

  const MASTERY_BANDS = [
    { id: 'chua-biet', label: 'Chưa biết', min: 0, max: 0.3 },
    { id: 'dang-hoc', label: 'Đang học', min: 0.3, max: 0.5 },
    { id: 'so-cap', label: 'Sơ cấp', min: 0.5, max: 0.7 },
    { id: 'kha', label: 'Khá', min: 0.7, max: 0.85 },
    // slight epsilon so 1.0 sits in the last band
    { id: 'thanh-thao', label: 'Thành thạo', min: 0.85, max: 1.0001 },
  ];

  const TARGET_BY_GOAL = {
    'giua-ky': 0.7,
    'cuoi-ky': 0.75,
    'vao-10': 0.85,
    'nang-cao': 0.95,
  };

  // ---- Knowledge tree stages (types/knowledgeTree.ts) --------------------

  const TREE_STAGES = [
    {
      id: 'mam-non',
      label: 'Mầm non',
      min: 0.0,
      max: 0.3,
      icon: '🌱',
      color: '#fb7185',
      description: 'Rễ còn nông, cần học nền tảng',
    },
    {
      id: 'choi-non',
      label: 'Chồi non',
      min: 0.3,
      max: 0.55,
      icon: '🌿',
      color: '#f59e0b',
      description: 'Đã hiểu cơ bản nhưng chưa ổn định',
    },
    {
      id: 'vuon-than',
      label: 'Vươn thân',
      min: 0.55,
      max: 0.8,
      icon: '🌳',
      color: '#14b8a6',
      description: 'Thân chắc, có thể vận dụng',
    },
    {
      id: 'ra-hoa',
      label: 'Ra hoa – kết quả',
      min: 0.8,
      max: 1.01,
      icon: '🌸',
      color: '#059669',
      description: 'Nắm chắc, có thể hỗ trợ bạn khác',
    },
  ];

  // ---- Gamification (types/learner.ts) -----------------------------------

  const XP = {
    perCorrect: 10,
    perAttempted: 5,
    perTopicMastered: 50,
    perReviewCompleted: 20,
  };

  /** level = floor(sqrt(xp / 100)) */
  function xpToLevel(xp) {
    return Math.floor(Math.sqrt(xp / 100));
  }

  const BADGE_DEFINITIONS = [
    { id: 'first-practice', label: 'Bước đầu', icon: '🎯', description: 'Hoàn thành phiên luyện tập đầu tiên' },
    { id: 'streak-5', label: 'Kiên trì', icon: '🔥', description: '5 ngày liên tiếp luyện tập' },
    { id: 'streak-10', label: 'Chuyên cần', icon: '💪', description: '10 ngày liên tiếp luyện tập' },
    { id: 'q-100', label: 'Bách chiến', icon: '⚔️', description: 'Trả lời 100 câu hỏi' },
    { id: 'q-500', label: 'Thiên lý', icon: '🏆', description: 'Trả lời 500 câu hỏi' },
    { id: 'first-mastery', label: 'Master đầu tiên', icon: '⭐', description: 'Thành thạo chủ đề đầu tiên (BKT ≥ 85%)' },
    { id: 'perfect-assessment', label: 'Hoàn hảo', icon: '💯', description: '100% đúng trong mini assessment' },
    { id: 'review-10', label: 'Ôn tập tốt', icon: '📖', description: 'Hoàn thành 10 phiên ôn tập SRS' },
  ];

  // ---- Learning path (types/learningPath.ts) -----------------------------

  const ACTIVITY_LABELS = {
    theory: 'Đọc lý thuyết',
    learn: 'Học qua ví dụ',
    practice: 'Luyện tập',
    review: 'Ôn tập',
  };

  const ACTIVITY_ICONS = {
    theory: 'menu_book',
    learn: 'school',
    practice: 'edit_note',
    review: 'history',
  };

  AM.const = {
    GRADE_LABELS: GRADE_LABELS,
    GOAL_OPTIONS: GOAL_OPTIONS,
    DAILY_MINUTES_OPTIONS: DAILY_MINUTES_OPTIONS,
    SELF_LEVEL_OPTIONS: SELF_LEVEL_OPTIONS,
    LADDER_ORDER: LADDER_ORDER,
    LEVEL_LABELS: LEVEL_LABELS,
    CAT_CONFIG: CAT_CONFIG,
    MASTERY_BANDS: MASTERY_BANDS,
    TARGET_BY_GOAL: TARGET_BY_GOAL,
    TREE_STAGES: TREE_STAGES,
    XP: XP,
    xpToLevel: xpToLevel,
    BADGE_DEFINITIONS: BADGE_DEFINITIONS,
    ACTIVITY_LABELS: ACTIVITY_LABELS,
    ACTIVITY_ICONS: ACTIVITY_ICONS,
  };
})(window.AM);
