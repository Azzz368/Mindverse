import type { Lang } from "./strings";

const en = {
  document: "Document", community: "Community", studio: "Studio", contact: "Contact",
  startNow: "Start Now", getStarted: "Get Started", allInOne: "All IN ONE, All IN ONCE.",
  directorTitle: "Your Custom Director Agent", thinking: "Thinking for 3 seconds",
  building: "Building storyboard......",
  approval: "3 editable steps prepared. Cost-bearing capabilities require preview approval before execution.",
  steps: ["prompt (video prompt words)", "script (storyline and custom-style script)", "video (generate skateboard video)"],
  promptLines: ["Generate a 10s cartoon-style", "video of a child playing on a skateboard. |"],
  briefDescription: "A little boy skateboards through city streets, weaving through vehicles and skillfully navigating large trucks.",
  scriptDescriptions: ["The first shot: introduces the characters and establishes the scene's style and camera angles.", "The second shot: creates a minor climax, establishes the protagonist's character, and explores various camera techniques."],
  customModify: "Custom modify", apply: "Apply", brief: "brief", script: "Script", storyboard: "Storyboard", text: "Text", image: "Image", video: "Video", videoMerge: "Video merge",
  footerHeadings: ["AI Video Generator", "AI Canvas & Workflow", "AI Digital Human", "Resource"],
  footerLinks: [
    ["Text to Video", "Image to Video", "One-Click Agent Video", "Auto Video Editor", "Frame Interpolation", "Cartoon Video Generator", "Music Video Generator"],
    ["Storyboard Generator", "Scene Library", "Character Lock", "Script to Storyboard", "Clip Sequencer", "Batch Video Production", "Node Workflow"],
    ["Digital Human Maker", "Talking Avatar Generator", "Photo to Avatar", "Face Consistency Lock", "Lip-Sync Generator", "Voice Cloning", "Virtual Presenter", "Multi-Language Avatar"],
    ["Help Center", "API Documentation", "Templates", "Pricing", "Blog", "Case Studies", "Community", "Contact Us"],
  ],
  dreamland: "A dreamland that fulfills all your imaginations.", terms: "Terms of Service", cookies: "Cookie preferences", privacy: "Privacy Policy",
  languageName: "English",
};

const zhHant: typeof en = {
  document: "文件", community: "社群", studio: "工作室", contact: "聯絡我們",
  startNow: "立即開始", getStarted: "開始創作", allInOne: "一站整合，一次完成。",
  directorTitle: "你的專屬導演智能體", thinking: "已思考 3 秒",
  building: "正在建立分鏡……", approval: "已準備 3 個可編輯步驟。涉及費用的功能會在執行前請你預覽確認。",
  steps: ["提示詞（影片提示文字）", "腳本（故事線與自訂風格腳本）", "影片（生成滑板影片）"],
  promptLines: ["生成一段 10 秒的卡通風格影片", "內容是一名孩子玩滑板。|"],
  briefDescription: "一名小男孩滑板穿梭城市街道，在車流與大型卡車之間靈活前進。",
  scriptDescriptions: ["第一個鏡頭：介紹角色，建立場景風格與攝影角度。", "第二個鏡頭：營造小高潮、塑造主角個性，並探索多種攝影技巧。"],
  customModify: "自訂修改", apply: "套用", brief: "簡介", script: "腳本", storyboard: "分鏡", text: "文字", image: "圖像", video: "影片", videoMerge: "影片合併",
  footerHeadings: ["AI 影片生成", "AI 畫布與工作流程", "AI 數位人", "資源"],
  footerLinks: [
    ["文字生成影片", "圖像生成影片", "一鍵智能體影片", "自動影片剪輯", "影格插值", "卡通影片生成", "音樂影片生成"],
    ["分鏡生成器", "場景庫", "角色一致性", "腳本轉分鏡", "片段排序", "批次影片製作", "節點工作流程"],
    ["數位人製作", "說話頭像生成", "照片轉頭像", "臉部一致性", "唇形同步", "聲音複製", "虛擬主持人", "多語言頭像"],
    ["幫助中心", "API 文件", "範本", "價格", "網誌", "案例研究", "社群", "聯絡我們"],
  ],
  dreamland: "實現你所有想像的夢想之境。", terms: "服務條款", cookies: "Cookie 偏好設定", privacy: "隱私權政策",
  languageName: "繁體中文",
};

const zhHans: typeof en = {
  ...zhHant,
  document: "文档", community: "社区", studio: "工作室", contact: "联系我们",
  startNow: "立即开始", getStarted: "开始创作", allInOne: "一站整合，一次完成。",
  directorTitle: "你的专属导演智能体", thinking: "已思考 3 秒", building: "正在创建分镜……",
  approval: "已准备 3 个可编辑步骤。涉及费用的功能会在执行前请你预览确认。",
  steps: ["提示词（视频提示文字）", "脚本（故事线与自定义风格脚本）", "视频（生成滑板视频）"],
  promptLines: ["生成一段 10 秒的卡通风格视频", "内容是一名孩子玩滑板。|"],
  briefDescription: "一名小男孩滑板穿梭城市街道，在车流与大型卡车之间灵活前进。",
  scriptDescriptions: ["第一个镜头：介绍角色，建立场景风格与摄影角度。", "第二个镜头：营造小高潮、塑造主角个性，并探索多种摄影技巧。"],
  customModify: "自定义修改", apply: "应用", brief: "简介", script: "脚本", storyboard: "分镜", text: "文字", image: "图像", video: "视频", videoMerge: "视频合并",
  footerHeadings: ["AI 视频生成", "AI 画布与工作流程", "AI 数字人", "资源"],
  footerLinks: [
    ["文字生成视频", "图像生成视频", "一键智能体视频", "自动视频剪辑", "帧插值", "卡通视频生成", "音乐视频生成"],
    ["分镜生成器", "场景库", "角色一致性", "脚本转分镜", "片段排序", "批量视频制作", "节点工作流程"],
    ["数字人制作", "说话头像生成", "照片转头像", "面部一致性", "唇形同步", "声音克隆", "虚拟主持人", "多语言头像"],
    ["帮助中心", "API 文档", "模板", "价格", "博客", "案例研究", "社区", "联系我们"],
  ],
  dreamland: "实现你所有想象的梦想之境。", terms: "服务条款", cookies: "Cookie 偏好设置", privacy: "隐私政策",
  languageName: "简体中文",
};

const ko: typeof en = {
  ...en,
  document: "문서", community: "커뮤니티", studio: "스튜디오", contact: "문의하기",
  startNow: "시작하기", getStarted: "시작하기", allInOne: "올인원, 한 번에 완성.",
  directorTitle: "나만의 디렉터 에이전트", thinking: "3초 동안 생각 중",
  building: "스토리보드를 만드는 중......", approval: "편집 가능한 3단계가 준비되었습니다. 비용이 발생하는 기능은 실행 전 미리보기 승인이 필요합니다.",
  steps: ["프롬프트 (영상 프롬프트 문구)", "스크립트 (스토리라인 및 맞춤 스타일 스크립트)", "영상 (스케이트보드 영상 생성)"],
  promptLines: ["10초 길이의 만화 스타일 영상을 생성하세요", "스케이트보드를 타는 아이의 영상입니다. |"],
  briefDescription: "한 소년이 스케이트보드를 타고 도시 거리를 지나며 차량과 대형 트럭 사이를 능숙하게 누빕니다.",
  scriptDescriptions: ["첫 번째 장면: 캐릭터를 소개하고 장면의 스타일과 카메라 앵글을 설정합니다.", "두 번째 장면: 작은 절정을 만들고 주인공의 개성을 드러내며 다양한 카메라 기법을 탐색합니다."],
  customModify: "맞춤 수정", apply: "적용", brief: "개요", script: "스크립트", storyboard: "스토리보드", text: "텍스트", image: "이미지", video: "영상", videoMerge: "영상 병합",
  footerHeadings: ["AI 영상 생성기", "AI 캔버스 및 워크플로", "AI 디지털 휴먼", "리소스"],
  footerLinks: [
    ["텍스트를 영상으로", "이미지를 영상으로", "원클릭 에이전트 영상", "자동 영상 편집", "프레임 보간", "만화 영상 생성기", "뮤직비디오 생성기"],
    ["스토리보드 생성기", "장면 라이브러리", "캐릭터 고정", "스크립트를 스토리보드로", "클립 시퀀서", "일괄 영상 제작", "노드 워크플로"],
    ["디지털 휴먼 제작", "말하는 아바타 생성기", "사진을 아바타로", "얼굴 일관성 고정", "립싱크 생성", "음성 복제", "가상 발표자", "다국어 아바타"],
    ["도움말 센터", "API 문서", "템플릿", "요금", "블로그", "사례 연구", "커뮤니티", "문의하기"],
  ],
  dreamland: "당신의 모든 상상을 실현하는 꿈의 세계.", terms: "서비스 약관", cookies: "쿠키 설정", privacy: "개인정보 처리방침",
  languageName: "한국어",
};

const th: typeof en = {
  ...en,
  document: "เอกสาร", community: "ชุมชน", studio: "สตูดิโอ", contact: "ติดต่อเรา",
  startNow: "เริ่มเลย", getStarted: "เริ่มต้นใช้งาน", allInOne: "ครบจบในที่เดียว ในครั้งเดียว",
  directorTitle: "เอเจนต์ผู้กำกับเฉพาะคุณ", thinking: "กำลังคิดเป็นเวลา 3 วินาที",
  building: "กำลังสร้างสตอรี่บอร์ด......", approval: "เตรียม 3 ขั้นตอนที่แก้ไขได้แล้ว ฟังก์ชันที่มีค่าใช้จ่ายต้องได้รับการอนุมัติก่อนดำเนินการ",
  steps: ["พรอมต์ (คำสั่งสำหรับวิดีโอ)", "สคริปต์ (เรื่องราวและสคริปต์สไตล์กำหนดเอง)", "วิดีโอ (สร้างวิดีโอสเก็ตบอร์ด)"],
  promptLines: ["สร้างวิดีโอการ์ตูนความยาว 10 วินาที", "ของเด็กที่เล่นสเก็ตบอร์ด |"],
  briefDescription: "เด็กชายคนหนึ่งเล่นสเก็ตบอร์ดผ่านถนนในเมือง หลบหลีกรถและรถบรรทุกขนาดใหญ่ได้อย่างคล่องแคล่ว",
  scriptDescriptions: ["ช็อตแรก: แนะนำตัวละครและกำหนดสไตล์ของฉากกับมุมกล้อง", "ช็อตที่สอง: สร้างจุดพีคเล็กน้อย พัฒนาบุคลิกตัวเอก และสำรวจเทคนิคกล้องต่าง ๆ"],
  customModify: "ปรับแต่ง", apply: "นำไปใช้", brief: "สรุป", script: "สคริปต์", storyboard: "สตอรี่บอร์ด", text: "ข้อความ", image: "ภาพ", video: "วิดีโอ", videoMerge: "รวมวิดีโอ",
  footerHeadings: ["เครื่องมือสร้างวิดีโอ AI", "ผืนงานและเวิร์กโฟลว์ AI", "มนุษย์ดิจิทัล AI", "ทรัพยากร"],
  footerLinks: [
    ["ข้อความเป็นวิดีโอ", "ภาพเป็นวิดีโอ", "วิดีโอเอเจนต์คลิกเดียว", "ตัดต่อวิดีโออัตโนมัติ", "แทรกเฟรม", "สร้างวิดีโอการ์ตูน", "สร้างมิวสิกวิดีโอ"],
    ["สร้างสตอรี่บอร์ด", "คลังฉาก", "ล็อกตัวละคร", "สคริปต์เป็นสตอรี่บอร์ด", "เรียงลำดับคลิป", "ผลิตวิดีโอเป็นชุด", "เวิร์กโฟลว์แบบโหนด"],
    ["สร้างมนุษย์ดิจิทัล", "สร้างอวาตาร์พูดได้", "ภาพถ่ายเป็นอวาตาร์", "ล็อกความสม่ำเสมอของใบหน้า", "ซิงก์ริมฝีปาก", "โคลนเสียง", "ผู้นำเสนอเสมือน", "อวาตาร์หลายภาษา"],
    ["ศูนย์ช่วยเหลือ", "เอกสาร API", "เทมเพลต", "ราคา", "บล็อก", "กรณีศึกษา", "ชุมชน", "ติดต่อเรา"],
  ],
  dreamland: "โลกแห่งความฝันที่เติมเต็มทุกจินตนาการของคุณ", terms: "ข้อกำหนดการใช้บริการ", cookies: "การตั้งค่าคุกกี้", privacy: "นโยบายความเป็นส่วนตัว",
  languageName: "ไทย",
};

const km: typeof en = {
  ...en,
  document: "ឯកសារ", community: "សហគមន៍", studio: "ស្ទូឌីយោ", contact: "ទំនាក់ទំនង",
  startNow: "ចាប់ផ្តើម", getStarted: "ចាប់ផ្តើម", allInOne: "គ្រប់យ៉ាងក្នុងមួយ ការបង្កើតតែមួយ។",
  directorTitle: "ភ្នាក់ងារដឹកនាំផ្ទាល់ខ្លួនរបស់អ្នក", thinking: "កំពុងគិតរយៈពេល 3 វិនាទី",
  building: "កំពុងបង្កើតស្តូរីបត......", approval: "បានរៀបចំជំហានកែសម្រួលបាន 3 ជំហាន។ មុខងារដែលមានតម្លៃត្រូវការការអនុម័តមុនពេលដំណើរការ។",
  steps: ["ពាក្យបញ្ជា (ពាក្យបញ្ជាវីដេអូ)", "ស្គ្រីប (ដំណើររឿង និងស្គ្រីបរចនាប័ទ្មផ្ទាល់ខ្លួន)", "វីដេអូ (បង្កើតវីដេអូជិះស្គី)"],
  promptLines: ["បង្កើតវីដេអូរចនាប័ទ្មគំនូរជីវចល 10 វិនាទី", "អំពីកុមារកំពុងជិះស្គី។ |"],
  briefDescription: "ក្មេងប្រុសម្នាក់ជិះស្គីតាមផ្លូវក្នុងទីក្រុង ដោយគេចចេញពីយានយន្ត និងរថយន្តដឹកទំនិញធំៗយ៉ាងប៉ិនប្រសប់។",
  scriptDescriptions: ["ឈុតទីមួយ៖ ណែនាំតួអង្គ និងកំណត់រចនាប័ទ្មឈុតឆាក និងមុំកាមេរ៉ា។", "ឈុតទីពីរ៖ បង្កើតចំណុចកំពូលតូចមួយ បង្ហាញបុគ្គលិកលក្ខណៈតួឯក និងសាកល្បងបច្ចេកទេសកាមេរ៉ាជាច្រើន។"],
  customModify: "កែសម្រួល", apply: "អនុវត្ត", brief: "សង្ខេប", script: "ស្គ្រីប", storyboard: "ស្តូរីបត", text: "អត្ថបទ", image: "រូបភាព", video: "វីដេអូ", videoMerge: "បញ្ចូលវីដេអូ",
  footerHeadings: ["កម្មវិធីបង្កើតវីដេអូ AI", "ផ្ទាំងគំនូរ និងលំហូរការងារ AI", "មនុស្សឌីជីថល AI", "ធនធាន"],
  footerLinks: [
    ["អត្ថបទទៅវីដេអូ", "រូបភាពទៅវីដេអូ", "វីដេអូភ្នាក់ងារដោយចុចម្តង", "កែសម្រួលវីដេអូស្វ័យប្រវត្តិ", "បញ្ចូលស៊ុម", "បង្កើតវីដេអូគំនូរជីវចល", "បង្កើតវីដេអូតន្ត្រី"],
    ["កម្មវិធីបង្កើតស្តូរីបត", "បណ្ណាល័យឈុតឆាក", "ចាក់សោតួអង្គ", "ស្គ្រីបទៅស្តូរីបត", "រៀបលំដាប់ឃ្លីប", "ផលិតវីដេអូជាបាច់", "លំហូរការងារបែបថ្នាំង"],
    ["បង្កើតមនុស្សឌីជីថល", "បង្កើតអវតារនិយាយ", "រូបថតទៅអវតារ", "ចាក់សោភាពស្របគ្នានៃមុខ", "សមកាលកម្មបបូរមាត់", "ចម្លងសំឡេង", "អ្នកធ្វើបទបង្ហាញនិម្មិត", "អវតារពហុភាសា"],
    ["មជ្ឈមណ្ឌលជំនួយ", "ឯកសារ API", "ពុម្ព", "តម្លៃ", "ប្លុក", "ករណីសិក្សា", "សហគមន៍", "ទំនាក់ទំនង"],
  ],
  dreamland: "ពិភពសុបិនដែលបំពេញគ្រប់ការស្រមើស្រមៃរបស់អ្នក។", terms: "លក្ខខណ្ឌប្រើប្រាស់", cookies: "ការកំណត់ខូគី", privacy: "គោលការណ៍ឯកជនភាព",
  languageName: "ខ្មែរ",
};

export type LandingStrings = typeof en;
export const landingStrings: Record<Lang, LandingStrings> = { en, "zh-Hant": zhHant, "zh-Hans": zhHans, ko, th, km };
export const languageOptions: Array<{ value: Lang; label: string }> = [
  { value: "zh-Hant", label: "繁體中文" },
  { value: "zh-Hans", label: "简体中文" },
  { value: "ko", label: "한국어" },
  { value: "th", label: "ไทย" },
  { value: "km", label: "ខ្មែរ" },
  { value: "en", label: "English" },
];
