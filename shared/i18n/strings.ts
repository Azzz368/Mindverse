export type Lang = "zh-Hant" | "zh-Hans" | "ko" | "th" | "km" | "en";

export interface Strings {
  // TopBar
  projectNamePlaceholder: string;
  exportJson: string;
  importJson: string;
  saveAsSkill: string;
  // TemplateGallery
  templates: string;
  // NodeToolbar
  addNode: string;
  addPrefix: string;
  nodeNames: Record<string, string>;
  // PropertyPanel
  inspector: string;
  inspectorHint: string;
  lastOutput: string;
  generateKeyframes: (n: number) => string;
  // BottomRunBar
  runSelected: string;
  runWorkflow: string;
  save: string;
  load: string;
  clear: string;
  mockProviderNote: string;
  // Node card
  duplicate: string;
  delete: string;
  runNode: string;
  uploadImage: string;
  placementHint: string;
  groupColor: string;
  runGroup: string;
  lockGroup: string;
  unlockGroup: string;
  settingsTitle: string;
  waitingGeneration: string;
  revisionOf: string;
  // AddNodeMenu
  menuSearch: string;
  menuCategoryNew: string;
  menuCategoryRecent: string;
  menuCategoryVideo: string;
  menuCategoryImage: string;
  menuCategoryAudio: string;
  menuCategoryText: string;
  menuCategoryStoryboard: string;
  menuKeepOpen: string;
  menuNoResults: string;
  toolDescSeedance: string;
  toolDescGen45: string;
  toolDescStoryboardImage: string;
  toolDescGptImage: string;
  toolDescUploadImage: string;
  toolDescAudio: string;
  toolDescText: string;
  toolDescPrompt: string;
  toolDescScript: string;
  toolDescStoryboard: string;
  toolDescReference: string;
  toolDescOutput: string;
  viewFullImage: string;
  annotateRefine: string;
  configureNode: string;
  scene: string;
  connectedAssets: (n: number) => string;
  noConnectedAssets: string;
  close: string;
  // Image annotation
  annotateTitle: string;
  annotateSubtitle: string;
  toolSelect: string;
  toolArrow: string;
  toolBox: string;
  toolCircle: string;
  toolText: string;
  deleteAnnotation: string;
  undo: string;
  clearAnnotations: string;
  newTextNote: string;
  selectedInstruction: string;
  overallInstruction: string;
  generateRevision: string;
  // Field labels
  fieldTitle: string;
  fieldPrompt: string;
  fieldNegativePrompt: string;
  fieldStyle: string;
  fieldAspectRatio: string;
  fieldInstruction: string;
  fieldInputText: string;
  fieldModel: string;
  fieldModelNote: string;
  fieldModelKlingNote: string;
  fieldTemperature: string;
  fieldCreativeBrief: string;
  fieldTone: string;
  fieldSceneCount: string;
  fieldVideoProvider: string;
  fieldFirstFrameUrl: string;
  fieldTokenstarMode: string;
  fieldImageAssetUrl: string;
  fieldVideoAssetUrl: string;
  fieldAudioAssetUrl: string;
  field302Mode: string;
  fieldDuration: string;
  fieldResolution: string;
  fieldFps: string;
  fieldGenerateAudio: string;
  fieldAudioPrompt: string;
  fieldVoice: string;
  fieldEmotion: string;
  fieldVolume: string;
  fieldDurationSec: string;
  fieldStoryBrief: string;
  fieldShotCount: string;
  fieldNotes: string;
  fieldFormat: string;
  fieldMotionPrompt: string;
  fieldImagePrompt: string;
  fieldSize: string;
  fieldReferenceImageUrl: string;
  fieldKlingMode: string;
  fieldKlingElementId: string;
  fieldReferenceVideoUrl: string;
  langToggle: string;
  serverDefault: string;
}

const zh: Strings = {
  projectNamePlaceholder: "未命名创作流程",
  exportJson: "导出 JSON",
  importJson: "导入 JSON",
  saveAsSkill: "保存为 Skill",
  templates: "模板",
  addNode: "添加节点",
  addPrefix: "添加",
  nodeNames: {
    prompt: "提示词", text: "文本", image: "图像", video: "视频", videoFrame: "视频抽帧",
    audio: "音频", musicGeneration: "HKGAI 音乐生成", hkgaiTTS: "HKGAI 语音生成", voiceClone: "人声克隆", voiceTTS: "克隆人声生成", storyboard: "分镜", storyboardImage: "分镜帧",
    reference: "参考", output: "输出",
  },
  inspector: "属性",
  inspectorHint: "选择节点来编辑配置并查看生成结果。",
  lastOutput: "上次输出",
  generateKeyframes: (n) => `生成 ${n} 个关键帧`,
  runSelected: "运行选中",
  runWorkflow: "运行全流程",
  save: "保存",
  load: "加载",
  clear: "清空",
  mockProviderNote: "Mock AI 模拟 · 本地优先画布",
  duplicate: "复制",
  delete: "删除",
  runNode: "运行",
  uploadImage: "添加 图片素材",
  placementHint: "左键单击画布放置节点\n右键单击取消",
  groupColor: "卡组颜色",
  runGroup: "运行当前卡组",
  lockGroup: "锁定卡组",
  unlockGroup: "解锁卡组",
  settingsTitle: "设置",
  waitingGeneration: "等待生成中…",
  revisionOf: "源图像的修订版",
  menuSearch: "按名称或类型搜索",
  menuCategoryNew: "新节点",
  menuCategoryRecent: "最近使用",
  menuCategoryVideo: "视频",
  menuCategoryImage: "图像",
  menuCategoryAudio: "音频",
  menuCategoryText: "文本",
  menuCategoryStoryboard: "分镜系列",
  menuKeepOpen: "保持打开以添加多个节点",
  menuNoResults: "未找到结果。",
  toolDescSeedance: "文本/图像/视频/音频转视频",
  toolDescGen45: "文本转视频",
  toolDescStoryboardImage: "生成分镜关键帧",
  toolDescGptImage: "文本/图像转图像",
  toolDescUploadImage: "上传本地文件到画布",
  toolDescAudio: "文本转音频",
  toolDescText: "文本生成",
  toolDescPrompt: "创意方向",
  toolDescScript: "虚构故事剧本",
  toolDescStoryboard: "光影与运动描述",
  toolDescReference: "视觉参考",
  toolDescOutput: "格式化输出",
  viewFullImage: "查看完整图像",
  annotateRefine: "标注 & 优化",
  configureNode: "在属性面板配置此节点。",
  scene: "场景",
  connectedAssets: (n) => `${n} 个已连接资产`,
  noConnectedAssets: "无已连接资产",
  close: "关闭",
  annotateTitle: "标注 & 优化",
  annotateSubtitle: "选择箭头工具，从来源拖到目标，然后描述该标注的修改说明。",
  toolSelect: "选择", toolArrow: "箭头", toolBox: "框", toolCircle: "圆", toolText: "文字",
  deleteAnnotation: "删除",
  undo: "撤销",
  clearAnnotations: "清空",
  newTextNote: "新文字注释",
  selectedInstruction: "选中的 {type} 说明",
  overallInstruction: "整体修订说明",
  generateRevision: "生成修订版",
  fieldTitle: "标题",
  fieldPrompt: "提示词",
  fieldNegativePrompt: "排除",
  fieldStyle: "风格",
  fieldAspectRatio: "宽高比",
  fieldInstruction: "指令",
  fieldInputText: "起始文本",
  fieldModel: "模型覆盖",
  fieldModelNote: "模型覆盖（留空=服务器默认）",
  fieldModelKlingNote: "模型覆盖（Kling/302-sora2 不使用）",
  fieldTemperature: "温度",
  fieldCreativeBrief: "创意概要",
  fieldTone: "语调",
  fieldSceneCount: "目标场景数",
  fieldVideoProvider: "视频提供商（Kling / 302.ai / TokenStar / HKGAI）",
  fieldFirstFrameUrl: "首帧 URL（Kling，可选）",
  fieldTokenstarMode: "TokenStar 模式（seedance: text/asset-video；Kling: kling-image/text/omni）",
  fieldImageAssetUrl: "现有图像资产 URL（asset://…，可选）",
  fieldVideoAssetUrl: "现有视频资产 URL（asset://…，可选）",
  fieldAudioAssetUrl: "现有音频资产 URL（asset://…，可选）",
  field302Mode: "302 生成模式",
  fieldDuration: "时长（Kling: 3-15；Sora: 4, 8 或 12）",
  fieldResolution: "分辨率（720p 或 1080p）",
  fieldFps: "帧率",
  fieldGenerateAudio: "生成音频",
  fieldAudioPrompt: "音频提示词",
  fieldVoice: "音色",
  fieldEmotion: "情绪",
  fieldVolume: "音量",
  fieldDurationSec: "时长（秒）",
  fieldStoryBrief: "故事概要",
  fieldShotCount: "目标镜头数（1-30）",
  fieldNotes: "备注",
  fieldFormat: "交付格式",
  fieldMotionPrompt: "动效提示词",
  fieldImagePrompt: "图像提示词",
  fieldSize: "尺寸",
  fieldReferenceImageUrl: "参考图像 URL",
  fieldKlingMode: "Kling 模式",
  fieldKlingElementId: "主体元素 ID（elem_xxx，逗号分隔多个）",
  fieldReferenceVideoUrl: "参考视频 URL（Kling Omni 视频编辑）",
  langToggle: "EN",
  serverDefault: "服务器默认",
};

const en: Strings = {
  projectNamePlaceholder: "Untitled creative flow",
  exportJson: "Export JSON",
  importJson: "Import JSON",
  saveAsSkill: "Save as Skill",
  templates: "Templates",
  addNode: "Add node",
  addPrefix: "Add",
  nodeNames: {
    prompt: "Prompt", text: "Text", image: "Image", video: "Video", videoFrame: "Video Frame",
    audio: "Audio", musicGeneration: "HKGAI Music", hkgaiTTS: "HKGAI TTS", voiceClone: "Voice Clone", voiceTTS: "Cloned Voice TTS", storyboard: "Storyboard", storyboardImage: "Storyboard Image",
    reference: "Reference", output: "Output",
  },
  inspector: "Inspector",
  inspectorHint: "Select a node to edit its settings and review generated output.",
  lastOutput: "Last output",
  generateKeyframes: (n) => `Generate ${n} keyframes`,
  runSelected: "Run selected",
  runWorkflow: "Run workflow",
  save: "Save",
  load: "Load",
  clear: "Clear",
  mockProviderNote: "Mock AI provider · local-first canvas",
  duplicate: "Duplicate",
  delete: "Delete",
  runNode: "Run",
  uploadImage: "Add image asset",
  placementHint: "Left-click canvas to place\nRight-click to cancel",
  groupColor: "Group color",
  runGroup: "Run this group",
  lockGroup: "Lock group",
  unlockGroup: "Unlock group",
  settingsTitle: "Settings",
  waitingGeneration: "Waiting for generation…",
  revisionOf: "Revision of source image",
  menuSearch: "Search by name or type",
  menuCategoryNew: "New nodes",
  menuCategoryRecent: "Recently used",
  menuCategoryVideo: "Video",
  menuCategoryImage: "Image",
  menuCategoryAudio: "Audio",
  menuCategoryText: "Text",
  menuCategoryStoryboard: "Storyboard",
  menuKeepOpen: "Keep open to add multiple nodes",
  menuNoResults: "No results found.",
  toolDescSeedance: "Text/Image/Video/Audio to Video",
  toolDescGen45: "Text to Video",
  toolDescStoryboardImage: "Generate keyframes",
  toolDescGptImage: "Text/Image to Image",
  toolDescUploadImage: "Local file to Canvas",
  toolDescAudio: "Text to Audio",
  toolDescText: "Text generation",
  toolDescPrompt: "Creative direction",
  toolDescScript: "A fictional story",
  toolDescStoryboard: "Light and motion",
  toolDescReference: "Visual reference",
  toolDescOutput: "Format output",
  viewFullImage: "View full image",
  annotateRefine: "Annotate & Refine",
  configureNode: "Configure this node in the inspector.",
  scene: "SCENE",
  connectedAssets: (n) => `${n} connected asset(s)`,
  noConnectedAssets: "No connected assets",
  close: "Close",
  annotateTitle: "Annotate & Refine",
  annotateSubtitle: "Choose Arrow, drag from the source to the target, then describe the change for that annotation.",
  toolSelect: "Select", toolArrow: "Arrow", toolBox: "Box", toolCircle: "Circle", toolText: "Text",
  deleteAnnotation: "Delete",
  undo: "Undo",
  clearAnnotations: "Clear",
  newTextNote: "New text note",
  selectedInstruction: "Selected {type} instruction",
  overallInstruction: "Overall revision instruction",
  generateRevision: "Generate revision",
  fieldTitle: "Title",
  fieldPrompt: "Prompt",
  fieldNegativePrompt: "Avoid",
  fieldStyle: "Style",
  fieldAspectRatio: "Aspect ratio",
  fieldInstruction: "Instruction",
  fieldInputText: "Starting text",
  fieldModel: "Model override",
  fieldModelNote: "Model override (blank = server default)",
  fieldModelKlingNote: "Model override (not used by 302-sora2 or Kling)",
  fieldTemperature: "Temperature",
  fieldCreativeBrief: "Creative brief",
  fieldTone: "Tone",
  fieldSceneCount: "Target scene count",
  fieldVideoProvider: "Video provider (Kling / 302.ai / TokenStar / HKGAI)",
  fieldFirstFrameUrl: "First frame URL (Kling, optional)",
  fieldTokenstarMode: "TokenStar mode (seedance: text/asset-video; Kling: kling-image/text/omni)",
  fieldImageAssetUrl: "Existing image asset URL (asset://…, optional)",
  fieldVideoAssetUrl: "Existing video asset URL (asset://…, optional)",
  fieldAudioAssetUrl: "Existing audio asset URL (asset://…, optional)",
  field302Mode: "302 generation mode",
  fieldDuration: "Duration (Kling: 3-15; Sora: 4, 8, or 12)",
  fieldResolution: "Resolution (720p or 1080p)",
  fieldFps: "FPS",
  fieldGenerateAudio: "Generate audio",
  fieldAudioPrompt: "Audio prompt",
  fieldVoice: "Voice override",
  fieldEmotion: "Emotion",
  fieldVolume: "Volume",
  fieldDurationSec: "Duration (seconds)",
  fieldStoryBrief: "Story brief",
  fieldShotCount: "Target shot count (1-30)",
  fieldNotes: "Notes",
  fieldFormat: "Deliverable format",
  fieldMotionPrompt: "Motion prompt",
  fieldImagePrompt: "Image prompt",
  fieldSize: "Size",
  fieldReferenceImageUrl: "Reference image URL",
  fieldKlingMode: "Kling mode",
  fieldKlingElementId: "Subject element ID(s) (elem_xxx, comma-separated)",
  fieldReferenceVideoUrl: "Reference video URL (Kling Omni video edit)",
  langToggle: "中文",
  serverDefault: "Server default",
};

const toTraditional = (value: string) => {
  const pairs = "创創导導图圖频頻视視语語画畫节節点點设設选選择擇编編辑輯结結关關闭閉复複制製删刪运運组組颜顏锁鎖启啟发發载載连連资資产產无無标標注註说說请請将將这這个個为為与與后後从從来來务務实實现現时時間間声聲场場镜鏡头頭数數网網页頁风風温溫输輸过過滤濾长長宽寬体體应應览覽写寫层層条條线線圆圓边邊总總单單录錄类類别別获獲张張帧幀仅僅该該让讓达達终終远遠码碼显顯缩縮拟擬优優级級调調质質态態听聽动動义義则則对對称稱内內换換夹夾据據经經统統约約续續处處识識觉覺戏戲术術区區块塊国國响響压壓预預认認证證额額权權并並两兩尽盡驱驅齐齊观觀项項报報错錯库庫档檔历歷签簽号號断斷确確会會种種纪紀鉴鑑临臨净淨进進转轉读讀闪閃寻尋异異盖蓋阶階负負销銷钱錢费費厂廠门門万萬气氣乐樂云雲构構桥橋归歸纳納里裡尝嘗试試误誤护護简簡杂雜释釋残殘补補触觸词詞剧劇帮幫审審阅閱叙敘叠疊轴軸烧燒减減赠贈习習兴興征徵冲衝须須独獨当當还還么麼摇搖稳穩轻輕强強静靜缓緩骤驟渐漸离離随隨满滿络絡储儲";
  const map = new Map<string, string>();
  for (let index = 0; index < pairs.length; index += 2) map.set(pairs[index], pairs[index + 1]);
  return [...value].map((character) => map.get(character) || character).join("");
};

const zhHant = Object.fromEntries(Object.entries(zh).map(([key, value]) => {
  if (typeof value === "string") return [key, toTraditional(value)];
  if (typeof value === "function") return [key, (count: number) => toTraditional(value(count))];
  return [key, Object.fromEntries(Object.entries(value).map(([itemKey, itemValue]) => [itemKey, toTraditional(String(itemValue))]))];
})) as unknown as Strings;

zhHant.langToggle = "English";
zhHant.saveAsSkill = "儲存為 Skill";

const koStrings: Strings = {
  ...en,
  projectNamePlaceholder: "제목 없는 창작 워크플로", exportJson: "JSON 내보내기", importJson: "JSON 가져오기", saveAsSkill: "Skill로 저장", templates: "템플릿", addNode: "노드 추가", addPrefix: "추가",
  nodeNames: { prompt: "프롬프트", text: "텍스트", image: "이미지", video: "비디오", videoFrame: "비디오 프레임", audio: "오디오", musicGeneration: "HKGAI 음악", hkgaiTTS: "HKGAI TTS", voiceClone: "음성 복제", voiceTTS: "복제 음성 TTS", storyboard: "스토리보드", storyboardImage: "스토리보드 이미지", reference: "참조", output: "출력" },
  inspector: "속성", inspectorHint: "노드를 선택해 설정을 편집하고 생성 결과를 확인하세요.", lastOutput: "최근 출력", generateKeyframes: (n) => `키프레임 ${n}개 생성`, runSelected: "선택 항목 실행", runWorkflow: "워크플로 실행", save: "저장", load: "불러오기", clear: "지우기", mockProviderNote: "Mock AI 제공자 · 로컬 우선 캔버스",
  duplicate: "복제", delete: "삭제", runNode: "실행", uploadImage: "이미지 에셋 추가", placementHint: "왼쪽 클릭으로 노드 배치\n오른쪽 클릭으로 취소", groupColor: "그룹 색상", runGroup: "그룹 실행", lockGroup: "그룹 잠금", unlockGroup: "그룹 잠금 해제", settingsTitle: "설정", waitingGeneration: "생성 대기 중…", revisionOf: "원본 이미지 수정본",
  menuSearch: "이름 또는 유형으로 검색", menuCategoryNew: "새 노드", menuCategoryRecent: "최근 사용", menuCategoryVideo: "비디오", menuCategoryImage: "이미지", menuCategoryAudio: "오디오", menuCategoryText: "텍스트", menuCategoryStoryboard: "스토리보드", menuKeepOpen: "여러 노드를 추가하려면 계속 열어 두기", menuNoResults: "검색 결과가 없습니다.",
  toolDescSeedance: "텍스트/이미지/비디오/오디오를 비디오로", toolDescGen45: "텍스트를 비디오로", toolDescStoryboardImage: "키프레임 생성", toolDescGptImage: "텍스트/이미지를 이미지로", toolDescUploadImage: "로컬 파일을 캔버스로", toolDescAudio: "텍스트를 오디오로", toolDescText: "텍스트 생성", toolDescPrompt: "창작 방향", toolDescScript: "가상 이야기", toolDescStoryboard: "빛과 움직임", toolDescReference: "시각 참조", toolDescOutput: "출력 형식 지정",
  viewFullImage: "전체 이미지 보기", annotateRefine: "주석 및 개선", configureNode: "속성 패널에서 이 노드를 설정하세요.", scene: "장면", connectedAssets: (n) => `연결된 에셋 ${n}개`, noConnectedAssets: "연결된 에셋 없음", close: "닫기", annotateTitle: "주석 및 개선", annotateSubtitle: "화살표 도구를 선택하고 원본에서 대상으로 드래그한 뒤 변경 내용을 설명하세요.", toolSelect: "선택", toolArrow: "화살표", toolBox: "상자", toolCircle: "원", toolText: "텍스트", deleteAnnotation: "삭제", undo: "실행 취소", clearAnnotations: "모두 지우기", newTextNote: "새 텍스트 메모", selectedInstruction: "선택한 {type} 지침", overallInstruction: "전체 수정 지침", generateRevision: "수정본 생성",
  fieldTitle: "제목", fieldPrompt: "프롬프트", fieldNegativePrompt: "제외 항목", fieldStyle: "스타일", fieldAspectRatio: "화면 비율", fieldInstruction: "지침", fieldInputText: "시작 텍스트", fieldModel: "모델 재정의", fieldModelNote: "모델 재정의 (비워 두면 서버 기본값)", fieldModelKlingNote: "모델 재정의 (Kling/302-sora2에는 사용 안 함)", fieldTemperature: "온도", fieldCreativeBrief: "창작 개요", fieldTone: "톤", fieldSceneCount: "목표 장면 수", fieldVideoProvider: "비디오 제공자 (Kling / 302.ai / TokenStar / HKGAI)", fieldFirstFrameUrl: "첫 프레임 URL (Kling, 선택 사항)", fieldTokenstarMode: "TokenStar 모드", fieldImageAssetUrl: "기존 이미지 에셋 URL", fieldVideoAssetUrl: "기존 비디오 에셋 URL", fieldAudioAssetUrl: "기존 오디오 에셋 URL", field302Mode: "302 생성 모드", fieldDuration: "길이", fieldResolution: "해상도", fieldFps: "프레임률", fieldGenerateAudio: "오디오 생성", fieldAudioPrompt: "오디오 프롬프트", fieldVoice: "음성", fieldEmotion: "감정", fieldVolume: "볼륨", fieldDurationSec: "길이(초)", fieldStoryBrief: "스토리 개요", fieldShotCount: "목표 샷 수", fieldNotes: "메모", fieldFormat: "출력 형식", fieldMotionPrompt: "모션 프롬프트", fieldImagePrompt: "이미지 프롬프트", fieldSize: "크기", fieldReferenceImageUrl: "참조 이미지 URL", fieldKlingMode: "Kling 모드", fieldKlingElementId: "피사체 요소 ID", fieldReferenceVideoUrl: "참조 비디오 URL", langToggle: "English", serverDefault: "서버 기본값",
};

const thStrings: Strings = {
  ...en,
  projectNamePlaceholder: "เวิร์กโฟลว์สร้างสรรค์ไม่มีชื่อ", exportJson: "ส่งออก JSON", importJson: "นำเข้า JSON", saveAsSkill: "บันทึกเป็น Skill", templates: "เทมเพลต", addNode: "เพิ่มโหนด", addPrefix: "เพิ่ม",
  nodeNames: { prompt: "พรอมต์", text: "ข้อความ", image: "รูปภาพ", video: "วิดีโอ", videoFrame: "เฟรมวิดีโอ", audio: "เสียง", musicGeneration: "เพลง HKGAI", hkgaiTTS: "HKGAI TTS", voiceClone: "โคลนเสียง", voiceTTS: "TTS เสียงโคลน", storyboard: "สตอรี่บอร์ด", storyboardImage: "ภาพสตอรี่บอร์ด", reference: "อ้างอิง", output: "ผลลัพธ์" },
  inspector: "คุณสมบัติ", inspectorHint: "เลือกโหนดเพื่อแก้ไขการตั้งค่าและดูผลลัพธ์ที่สร้าง", lastOutput: "ผลลัพธ์ล่าสุด", generateKeyframes: (n) => `สร้างคีย์เฟรม ${n} เฟรม`, runSelected: "เรียกใช้ที่เลือก", runWorkflow: "เรียกใช้เวิร์กโฟลว์", save: "บันทึก", load: "โหลด", clear: "ล้าง", mockProviderNote: "ผู้ให้บริการ Mock AI · แคนวาสแบบเก็บในเครื่องก่อน",
  duplicate: "ทำสำเนา", delete: "ลบ", runNode: "เรียกใช้", uploadImage: "เพิ่มแอสเซตรูปภาพ", placementHint: "คลิกซ้ายเพื่อวางโหนด\nคลิกขวาเพื่อยกเลิก", groupColor: "สีกลุ่ม", runGroup: "เรียกใช้กลุ่มนี้", lockGroup: "ล็อกกลุ่ม", unlockGroup: "ปลดล็อกกลุ่ม", settingsTitle: "การตั้งค่า", waitingGeneration: "กำลังรอสร้าง…", revisionOf: "เวอร์ชันแก้ไขของรูปต้นฉบับ",
  menuSearch: "ค้นหาตามชื่อหรือประเภท", menuCategoryNew: "โหนดใหม่", menuCategoryRecent: "ใช้ล่าสุด", menuCategoryVideo: "วิดีโอ", menuCategoryImage: "รูปภาพ", menuCategoryAudio: "เสียง", menuCategoryText: "ข้อความ", menuCategoryStoryboard: "สตอรี่บอร์ด", menuKeepOpen: "เปิดค้างไว้เพื่อเพิ่มหลายโหนด", menuNoResults: "ไม่พบผลลัพธ์",
  toolDescSeedance: "ข้อความ/รูปภาพ/วิดีโอ/เสียงเป็นวิดีโอ", toolDescGen45: "ข้อความเป็นวิดีโอ", toolDescStoryboardImage: "สร้างคีย์เฟรม", toolDescGptImage: "ข้อความ/รูปภาพเป็นรูปภาพ", toolDescUploadImage: "ไฟล์ในเครื่องไปยังแคนวาส", toolDescAudio: "ข้อความเป็นเสียง", toolDescText: "สร้างข้อความ", toolDescPrompt: "ทิศทางสร้างสรรค์", toolDescScript: "เรื่องแต่ง", toolDescStoryboard: "แสงและการเคลื่อนไหว", toolDescReference: "ภาพอ้างอิง", toolDescOutput: "จัดรูปแบบผลลัพธ์",
  viewFullImage: "ดูรูปเต็ม", annotateRefine: "ใส่คำอธิบายและปรับปรุง", configureNode: "ตั้งค่าโหนดนี้ในแผงคุณสมบัติ", scene: "ฉาก", connectedAssets: (n) => `แอสเซตที่เชื่อมต่อ ${n} รายการ`, noConnectedAssets: "ไม่มีแอสเซตที่เชื่อมต่อ", close: "ปิด", annotateTitle: "ใส่คำอธิบายและปรับปรุง", annotateSubtitle: "เลือกเครื่องมือลูกศร ลากจากต้นทางไปยังเป้าหมาย แล้วอธิบายการเปลี่ยนแปลง", toolSelect: "เลือก", toolArrow: "ลูกศร", toolBox: "กล่อง", toolCircle: "วงกลม", toolText: "ข้อความ", deleteAnnotation: "ลบ", undo: "เลิกทำ", clearAnnotations: "ล้างทั้งหมด", newTextNote: "บันทึกข้อความใหม่", selectedInstruction: "คำสั่ง {type} ที่เลือก", overallInstruction: "คำสั่งแก้ไขโดยรวม", generateRevision: "สร้างเวอร์ชันแก้ไข",
  fieldTitle: "ชื่อ", fieldPrompt: "พรอมต์", fieldNegativePrompt: "หลีกเลี่ยง", fieldStyle: "สไตล์", fieldAspectRatio: "อัตราส่วนภาพ", fieldInstruction: "คำสั่ง", fieldInputText: "ข้อความเริ่มต้น", fieldModel: "แทนที่โมเดล", fieldModelNote: "แทนที่โมเดล (ว่าง = ค่าเริ่มต้นเซิร์ฟเวอร์)", fieldModelKlingNote: "แทนที่โมเดล (ไม่ใช้กับ Kling/302-sora2)", fieldTemperature: "อุณหภูมิ", fieldCreativeBrief: "สรุปแนวคิด", fieldTone: "โทน", fieldSceneCount: "จำนวนฉากเป้าหมาย", fieldVideoProvider: "ผู้ให้บริการวิดีโอ (Kling / 302.ai / TokenStar / HKGAI)", fieldFirstFrameUrl: "URL เฟรมแรก (Kling, ไม่บังคับ)", fieldTokenstarMode: "โหมด TokenStar", fieldImageAssetUrl: "URL แอสเซตรูปภาพ", fieldVideoAssetUrl: "URL แอสเซตวิดีโอ", fieldAudioAssetUrl: "URL แอสเซตเสียง", field302Mode: "โหมดการสร้าง 302", fieldDuration: "ระยะเวลา", fieldResolution: "ความละเอียด", fieldFps: "อัตราเฟรม", fieldGenerateAudio: "สร้างเสียง", fieldAudioPrompt: "พรอมต์เสียง", fieldVoice: "เสียง", fieldEmotion: "อารมณ์", fieldVolume: "ระดับเสียง", fieldDurationSec: "ระยะเวลา (วินาที)", fieldStoryBrief: "สรุปเรื่อง", fieldShotCount: "จำนวนช็อตเป้าหมาย", fieldNotes: "หมายเหตุ", fieldFormat: "รูปแบบผลลัพธ์", fieldMotionPrompt: "พรอมต์การเคลื่อนไหว", fieldImagePrompt: "พรอมต์รูปภาพ", fieldSize: "ขนาด", fieldReferenceImageUrl: "URL รูปภาพอ้างอิง", fieldKlingMode: "โหมด Kling", fieldKlingElementId: "ID องค์ประกอบตัวแบบ", fieldReferenceVideoUrl: "URL วิดีโออ้างอิง", langToggle: "English", serverDefault: "ค่าเริ่มต้นเซิร์ฟเวอร์",
};

const kmStrings: Strings = {
  ...en,
  projectNamePlaceholder: "លំហូរការងារច្នៃប្រឌិតគ្មានចំណងជើង", exportJson: "នាំចេញ JSON", importJson: "នាំចូល JSON", saveAsSkill: "រក្សាទុកជា Skill", templates: "គំរូ", addNode: "បន្ថែមថ្នាំង", addPrefix: "បន្ថែម",
  nodeNames: { prompt: "ពាក្យបញ្ជា", text: "អត្ថបទ", image: "រូបភាព", video: "វីដេអូ", videoFrame: "ហ្វ្រេមវីដេអូ", audio: "សំឡេង", musicGeneration: "តន្ត្រី HKGAI", hkgaiTTS: "HKGAI TTS", voiceClone: "ចម្លងសំឡេង", voiceTTS: "TTS សំឡេងចម្លង", storyboard: "ស្តូរីបត", storyboardImage: "រូបភាពស្តូរីបត", reference: "យោង", output: "លទ្ធផល" },
  inspector: "លក្ខណសម្បត្តិ", inspectorHint: "ជ្រើសថ្នាំងដើម្បីកែការកំណត់ និងពិនិត្យលទ្ធផលដែលបានបង្កើត។", lastOutput: "លទ្ធផលចុងក្រោយ", generateKeyframes: (n) => `បង្កើតហ្វ្រេមគន្លឹះ ${n}`, runSelected: "ដំណើរការដែលបានជ្រើស", runWorkflow: "ដំណើរការលំហូរការងារ", save: "រក្សាទុក", load: "ផ្ទុក", clear: "សម្អាត", mockProviderNote: "អ្នកផ្តល់ Mock AI · ផ្ទាំងក្រណាត់រក្សាទុកក្នុងម៉ាស៊ីនជាមុន",
  duplicate: "ស្ទួន", delete: "លុប", runNode: "ដំណើរការ", uploadImage: "បន្ថែមទ្រព្យរូបភាព", placementHint: "ចុចឆ្វេងដើម្បីដាក់ថ្នាំង\nចុចស្តាំដើម្បីបោះបង់", groupColor: "ពណ៌ក្រុម", runGroup: "ដំណើរការក្រុមនេះ", lockGroup: "ចាក់សោក្រុម", unlockGroup: "ដោះសោក្រុម", settingsTitle: "ការកំណត់", waitingGeneration: "កំពុងរង់ចាំបង្កើត…", revisionOf: "កំណែកែសម្រួលនៃរូបភាពដើម",
  menuSearch: "ស្វែងរកតាមឈ្មោះ ឬប្រភេទ", menuCategoryNew: "ថ្នាំងថ្មី", menuCategoryRecent: "បានប្រើថ្មីៗ", menuCategoryVideo: "វីដេអូ", menuCategoryImage: "រូបភាព", menuCategoryAudio: "សំឡេង", menuCategoryText: "អត្ថបទ", menuCategoryStoryboard: "ស្តូរីបត", menuKeepOpen: "ទុកឱ្យបើកដើម្បីបន្ថែមថ្នាំងច្រើន", menuNoResults: "រកមិនឃើញលទ្ធផល។",
  toolDescSeedance: "អត្ថបទ/រូបភាព/វីដេអូ/សំឡេងទៅវីដេអូ", toolDescGen45: "អត្ថបទទៅវីដេអូ", toolDescStoryboardImage: "បង្កើតហ្វ្រេមគន្លឹះ", toolDescGptImage: "អត្ថបទ/រូបភាពទៅរូបភាព", toolDescUploadImage: "ឯកសារក្នុងម៉ាស៊ីនទៅផ្ទាំងក្រណាត់", toolDescAudio: "អត្ថបទទៅសំឡេង", toolDescText: "បង្កើតអត្ថបទ", toolDescPrompt: "ទិសដៅច្នៃប្រឌិត", toolDescScript: "រឿងប្រឌិត", toolDescStoryboard: "ពន្លឺ និងចលនា", toolDescReference: "រូបភាពយោង", toolDescOutput: "កំណត់ទ្រង់ទ្រាយលទ្ធផល",
  viewFullImage: "មើលរូបភាពពេញ", annotateRefine: "កំណត់ចំណាំ និងកែលម្អ", configureNode: "កំណត់ថ្នាំងនេះក្នុងផ្ទាំងលក្ខណសម្បត្តិ។", scene: "ឈុតឆាក", connectedAssets: (n) => `ទ្រព្យដែលបានភ្ជាប់ ${n}`, noConnectedAssets: "គ្មានទ្រព្យបានភ្ជាប់", close: "បិទ", annotateTitle: "កំណត់ចំណាំ និងកែលម្អ", annotateSubtitle: "ជ្រើសឧបករណ៍ព្រួញ អូសពីប្រភពទៅគោលដៅ ហើយពណ៌នាការផ្លាស់ប្តូរ។", toolSelect: "ជ្រើស", toolArrow: "ព្រួញ", toolBox: "ប្រអប់", toolCircle: "រង្វង់", toolText: "អត្ថបទ", deleteAnnotation: "លុប", undo: "មិនធ្វើវិញ", clearAnnotations: "សម្អាតទាំងអស់", newTextNote: "កំណត់ចំណាំអត្ថបទថ្មី", selectedInstruction: "សេចក្តីណែនាំ {type} ដែលបានជ្រើស", overallInstruction: "សេចក្តីណែនាំកែសម្រួលទាំងមូល", generateRevision: "បង្កើតកំណែកែសម្រួល",
  fieldTitle: "ចំណងជើង", fieldPrompt: "ពាក្យបញ្ជា", fieldNegativePrompt: "ជៀសវាង", fieldStyle: "រចនាប័ទ្ម", fieldAspectRatio: "សមាមាត្រ", fieldInstruction: "សេចក្តីណែនាំ", fieldInputText: "អត្ថបទចាប់ផ្តើម", fieldModel: "ប្ដូរម៉ូដែល", fieldModelNote: "ប្ដូរម៉ូដែល (ទទេ = លំនាំដើមម៉ាស៊ីនមេ)", fieldModelKlingNote: "ប្ដូរម៉ូដែល (មិនប្រើសម្រាប់ Kling/302-sora2)", fieldTemperature: "សីតុណ្ហភាព", fieldCreativeBrief: "សង្ខេបគំនិត", fieldTone: "សំនៀង", fieldSceneCount: "ចំនួនឈុតគោលដៅ", fieldVideoProvider: "អ្នកផ្តល់វីដេអូ (Kling / 302.ai / TokenStar / HKGAI)", fieldFirstFrameUrl: "URL ហ្វ្រេមដំបូង (Kling, ជាជម្រើស)", fieldTokenstarMode: "របៀប TokenStar", fieldImageAssetUrl: "URL ទ្រព្យរូបភាព", fieldVideoAssetUrl: "URL ទ្រព្យវីដេអូ", fieldAudioAssetUrl: "URL ទ្រព្យសំឡេង", field302Mode: "របៀបបង្កើត 302", fieldDuration: "រយៈពេល", fieldResolution: "គុណភាពបង្ហាញ", fieldFps: "អត្រាហ្វ្រេម", fieldGenerateAudio: "បង្កើតសំឡេង", fieldAudioPrompt: "ពាក្យបញ្ជាសំឡេង", fieldVoice: "សំឡេង", fieldEmotion: "អារម្មណ៍", fieldVolume: "កម្រិតសំឡេង", fieldDurationSec: "រយៈពេល (វិនាទី)", fieldStoryBrief: "សង្ខេបរឿង", fieldShotCount: "ចំនួនឈុតគោលដៅ", fieldNotes: "កំណត់ចំណាំ", fieldFormat: "ទ្រង់ទ្រាយលទ្ធផល", fieldMotionPrompt: "ពាក្យបញ្ជាចលនា", fieldImagePrompt: "ពាក្យបញ្ជារូបភាព", fieldSize: "ទំហំ", fieldReferenceImageUrl: "URL រូបភាពយោង", fieldKlingMode: "របៀប Kling", fieldKlingElementId: "ID ធាតុប្រធានបទ", fieldReferenceVideoUrl: "URL វីដេអូយោង", langToggle: "English", serverDefault: "លំនាំដើមម៉ាស៊ីនមេ",
};

export const strings: Record<Lang, Strings> = {
  "zh-Hant": zhHant,
  "zh-Hans": zh,
  ko: koStrings,
  th: thStrings,
  km: kmStrings,
  en,
};
