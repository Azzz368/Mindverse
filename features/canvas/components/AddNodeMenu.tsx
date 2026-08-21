import { useState, useRef, useMemo } from "react";
import { useCanvasStore } from "@/features/canvas/state/canvasStore";
import { archiveAudioFile, archiveImageFile, archiveVideoFile } from "@/features/canvas/services/mediaArchiveClient";
import { useLang } from "@/components/providers/LangProvider";
import { DEFAULT_VIDEO_MODEL_PRESET_ID, videoModelPatch } from "@/shared/workflow/videoModelPresets";
import type { CanvasNodeData, NodeType } from "@/shared/canvas";

export function getIcon(type: string) {
  const map: Record<string, string> = { prompt: "\u2726", text: "T", image: "\u25C8", video: "\u25B6", videoRegeneration: "2K", videoFrame: "\u25A3", videoEdit: "\u2702", motion: "\u25A3", audio: "\u266B", musicGeneration: "M", hkgaiTTS: "H", voiceClone: "V", voiceTTS: "\u266A", storyboard: "\u25A6", reference: "\u2141", output: "\u2197", upload_image: "+", upload_video: "+", upload_audio: "+" };
  return map[type] || "T";
}

// 视频 1.png, 图像 2.png, 音频 3.png, 文本 4.png, 分镜系列 5.png, 参考图类 normal.png
const ALL_CATEGORIES = ["Upload", "Text", "Image", "Video", "Audio", "Story"] as const;

const menuCopy = {
  en: {
    categories: { Upload: "Upload", Text: "Text", Image: "Image", Video: "Video", Audio: "Audio", Story: "Story" },
    tools: {
      "prompt-enhancer": ["Prompt Enhancer", "Turn simple ideas into detailed, generation-ready prompts."], "image-to-prompt": ["Image to Prompt", "Turn a reference image into a detailed generation prompt."], "upload-image": ["Upload Image", "Use a local image file in your canvas."], "image-generation": ["Image Generation", "Create images from text prompts or reference images."], "specialized-image-tools": ["Specialized Image Tools", "Create consistent character, scene, and spatial reference images."], "upload-video": ["Upload Video", "Use a local video file in your canvas."], "video-generation": ["Video Generation", "Create videos from text, images, or audio."], "video-edit": ["Video Edit", "Visual sequencing, trimming, transitions, music, subtitles, and transcoding."], "extract-frames": ["Extract Frames", "Connect a video and extract the current or final frame."], "upload-audio": ["Upload Audio", "Use a local audio file as BGM or reference audio."], "voice-cloning": ["Voice Cloning", "Create a voice from authorized audio."], "text-to-speech": ["Text-to-Speech", "Convert text into natural-sounding speech."], "music-generation": ["Music Generation", "Create music from styles, tags, and song sections."], "story-generator": ["Story Generator", "Develop an original story and script from a creative idea."], "storyboard-generator": ["Storyboard Generator", "Turn a script into structured shots with visual and motion directions."],
    },
  },
  "zh-Hans": {
    categories: { Upload: "上传", Text: "文本", Image: "图像", Video: "视频", Audio: "音频", Story: "故事创作" },
    tools: {
      "prompt-enhancer": ["提示词增强", "将简单想法扩展为可直接生成的详细提示词。"], "image-to-prompt": ["图片转提示词", "将参考图片转换为详细的生成提示词。"], "upload-image": ["上传图片", "将本地图片文件添加到画布。"], "image-generation": ["图像生成", "根据文本提示词或参考图片生成图像。"], "specialized-image-tools": ["专业图像工具", "创建角色、场景和空间的一致性参考图。"], "upload-video": ["上传视频", "将本地视频文件添加到画布。"], "video-generation": ["视频生成", "根据文本、图像或音频生成视频。"], "video-edit": ["视频编辑", "进行片段排序、裁剪、转场、音乐、字幕和转码。"], "extract-frames": ["提取帧", "连接视频并提取当前帧或最后一帧。"], "upload-audio": ["上传音频", "上传本地音频作为背景音乐或参考音频。"], "voice-cloning": ["声音克隆", "使用已获授权的音频创建声音。"], "text-to-speech": ["文本转语音", "将文本转换为自然流畅的语音。"], "music-generation": ["音乐生成", "根据风格、标签和歌曲段落创作音乐。"], "story-generator": ["故事生成器", "根据创意构思原创故事和剧本。"], "storyboard-generator": ["分镜生成器", "将剧本转换为包含画面与运动指引的结构化镜头。"],
    },
  },
  "zh-Hant": {
    categories: { Upload: "上傳", Text: "文字", Image: "圖像", Video: "影片", Audio: "音訊", Story: "故事創作" },
    tools: {
      "prompt-enhancer": ["提示詞增強", "將簡單想法擴展為可直接生成的詳細提示詞。"], "image-to-prompt": ["圖片轉提示詞", "將參考圖片轉換為詳細的生成提示詞。"], "upload-image": ["上傳圖片", "將本機圖片檔案加入畫布。"], "image-generation": ["圖像生成", "根據文字提示詞或參考圖片生成圖像。"], "specialized-image-tools": ["專業圖像工具", "建立角色、場景與空間的一致性參考圖。"], "upload-video": ["上傳影片", "將本機影片檔案加入畫布。"], "video-generation": ["影片生成", "根據文字、圖像或音訊生成影片。"], "video-edit": ["影片編輯", "進行片段排序、裁剪、轉場、音樂、字幕與轉碼。"], "extract-frames": ["擷取影格", "連接影片並擷取目前影格或最後一格。"], "upload-audio": ["上傳音訊", "上傳本機音訊作為背景音樂或參考音訊。"], "voice-cloning": ["聲音複製", "使用已獲授權的音訊建立聲音。"], "text-to-speech": ["文字轉語音", "將文字轉換為自然流暢的語音。"], "music-generation": ["音樂生成", "根據風格、標籤與歌曲段落創作音樂。"], "story-generator": ["故事生成器", "根據創意構思原創故事與劇本。"], "storyboard-generator": ["分鏡生成器", "將劇本轉換為包含畫面與運動指引的結構化鏡頭。"],
    },
  },
  ko: {
    categories: { Upload: "업로드", Text: "텍스트", Image: "이미지", Video: "비디오", Audio: "오디오", Story: "스토리 개발" },
    tools: {
      "prompt-enhancer": ["프롬프트 향상", "간단한 아이디어를 생성 준비가 된 상세 프롬프트로 확장합니다."], "image-to-prompt": ["이미지를 프롬프트로", "참조 이미지를 상세 생성 프롬프트로 변환합니다."], "upload-image": ["이미지 업로드", "로컬 이미지 파일을 캔버스에 추가합니다."], "image-generation": ["이미지 생성", "텍스트 프롬프트나 참조 이미지로 이미지를 만듭니다."], "specialized-image-tools": ["전문 이미지 도구", "일관된 캐릭터, 장면, 공간 참조 이미지를 만듭니다."], "upload-video": ["비디오 업로드", "로컬 비디오 파일을 캔버스에 추가합니다."], "video-generation": ["비디오 생성", "텍스트, 이미지 또는 오디오로 비디오를 만듭니다."], "video-edit": ["비디오 편집", "클립 순서, 자르기, 전환, 음악, 자막 및 트랜스코딩을 설정합니다."], "extract-frames": ["프레임 추출", "비디오를 연결해 현재 또는 마지막 프레임을 추출합니다."], "upload-audio": ["오디오 업로드", "로컬 오디오를 배경 음악이나 참조 오디오로 사용합니다."], "voice-cloning": ["음성 복제", "권한이 있는 오디오로 음성을 만듭니다."], "text-to-speech": ["텍스트 음성 변환", "텍스트를 자연스러운 음성으로 변환합니다."], "music-generation": ["음악 생성", "스타일, 태그 및 곡 구간으로 음악을 만듭니다."], "story-generator": ["스토리 생성기", "창의적인 아이디어로 독창적인 이야기와 대본을 개발합니다."], "storyboard-generator": ["스토리보드 생성기", "대본을 시각 및 동작 지시가 있는 구조화된 샷으로 변환합니다."],
    },
  },
  th: {
    categories: { Upload: "อัปโหลด", Text: "ข้อความ", Image: "รูปภาพ", Video: "วิดีโอ", Audio: "เสียง", Story: "พัฒนาเรื่องราว" },
    tools: {
      "prompt-enhancer": ["ปรับปรุงพรอมต์", "เปลี่ยนไอเดียง่าย ๆ ให้เป็นพรอมต์ละเอียดพร้อมสร้าง"], "image-to-prompt": ["รูปภาพเป็นพรอมต์", "เปลี่ยนรูปภาพอ้างอิงให้เป็นพรอมต์การสร้างแบบละเอียด"], "upload-image": ["อัปโหลดรูปภาพ", "เพิ่มไฟล์รูปภาพจากเครื่องลงในแคนวาส"], "image-generation": ["สร้างรูปภาพ", "สร้างรูปภาพจากพรอมต์ข้อความหรือรูปภาพอ้างอิง"], "specialized-image-tools": ["เครื่องมือรูปภาพเฉพาะทาง", "สร้างภาพอ้างอิงตัวละคร ฉาก และพื้นที่ให้สอดคล้องกัน"], "upload-video": ["อัปโหลดวิดีโอ", "เพิ่มไฟล์วิดีโอจากเครื่องลงในแคนวาส"], "video-generation": ["สร้างวิดีโอ", "สร้างวิดีโอจากข้อความ รูปภาพ หรือเสียง"], "video-edit": ["ตัดต่อวิดีโอ", "จัดลำดับ ตัดแต่ง ใส่ทรานซิชัน เพลง คำบรรยาย และแปลงไฟล์"], "extract-frames": ["แยกเฟรม", "เชื่อมต่อวิดีโอแล้วแยกเฟรมปัจจุบันหรือเฟรมสุดท้าย"], "upload-audio": ["อัปโหลดเสียง", "ใช้ไฟล์เสียงจากเครื่องเป็นเพลงพื้นหลังหรือเสียงอ้างอิง"], "voice-cloning": ["โคลนเสียง", "สร้างเสียงจากไฟล์เสียงที่ได้รับอนุญาต"], "text-to-speech": ["ข้อความเป็นเสียงพูด", "เปลี่ยนข้อความเป็นเสียงพูดที่เป็นธรรมชาติ"], "music-generation": ["สร้างเพลง", "สร้างเพลงจากสไตล์ แท็ก และส่วนต่าง ๆ ของเพลง"], "story-generator": ["เครื่องมือสร้างเรื่องราว", "พัฒนาเรื่องและบทต้นฉบับจากไอเดียสร้างสรรค์"], "storyboard-generator": ["เครื่องมือสร้างสตอรี่บอร์ด", "เปลี่ยนบทเป็นช็อตแบบมีโครงสร้างพร้อมคำสั่งภาพและการเคลื่อนไหว"],
    },
  },
  km: {
    categories: { Upload: "ផ្ទុកឡើង", Text: "អត្ថបទ", Image: "រូបភាព", Video: "វីដេអូ", Audio: "សំឡេង", Story: "អភិវឌ្ឍរឿង" },
    tools: {
      "prompt-enhancer": ["កែលម្អពាក្យបញ្ជា", "បម្លែងគំនិតសាមញ្ញទៅជាពាក្យបញ្ជាលម្អិតដែលត្រៀមសម្រាប់បង្កើត។"], "image-to-prompt": ["រូបភាពទៅពាក្យបញ្ជា", "បម្លែងរូបភាពយោងទៅជាពាក្យបញ្ជាបង្កើតលម្អិត។"], "upload-image": ["ផ្ទុករូបភាពឡើង", "បន្ថែមឯកសាររូបភាពក្នុងម៉ាស៊ីនទៅផ្ទាំងក្រណាត់។"], "image-generation": ["បង្កើតរូបភាព", "បង្កើតរូបភាពពីពាក្យបញ្ជាអត្ថបទ ឬរូបភាពយោង។"], "specialized-image-tools": ["ឧបករណ៍រូបភាពឯកទេស", "បង្កើតរូបភាពយោងតួអង្គ ឈុតឆាក និងលំហដែលមានសង្គតិភាព។"], "upload-video": ["ផ្ទុកវីដេអូឡើង", "បន្ថែមឯកសារវីដេអូក្នុងម៉ាស៊ីនទៅផ្ទាំងក្រណាត់។"], "video-generation": ["បង្កើតវីដេអូ", "បង្កើតវីដេអូពីអត្ថបទ រូបភាព ឬសំឡេង។"], "video-edit": ["កែសម្រួលវីដេអូ", "រៀបលំដាប់ កាត់ត បន្ថែមការផ្លាស់ប្តូរ តន្ត្រី ចំណងជើងរង និងបម្លែងទ្រង់ទ្រាយ។"], "extract-frames": ["ស្រង់ហ្វ្រេម", "ភ្ជាប់វីដេអូ ហើយស្រង់ហ្វ្រេមបច្ចុប្បន្ន ឬចុងក្រោយ។"], "upload-audio": ["ផ្ទុកសំឡេងឡើង", "ប្រើឯកសារសំឡេងក្នុងម៉ាស៊ីនជាតន្ត្រីផ្ទៃក្រោយ ឬសំឡេងយោង។"], "voice-cloning": ["ចម្លងសំឡេង", "បង្កើតសំឡេងពីអូឌីយ៉ូដែលមានការអនុញ្ញាត។"], "text-to-speech": ["អត្ថបទទៅជាសំឡេង", "បម្លែងអត្ថបទទៅជាសំឡេងធម្មជាតិ។"], "music-generation": ["បង្កើតតន្ត្រី", "បង្កើតតន្ត្រីពីរចនាប័ទ្ម ស្លាក និងផ្នែកបទចម្រៀង។"], "story-generator": ["កម្មវិធីបង្កើតរឿង", "អភិវឌ្ឍរឿងដើម និងស្គ្រីបពីគំនិតច្នៃប្រឌិត។"], "storyboard-generator": ["កម្មវិធីបង្កើតស្តូរីបត", "បម្លែងស្គ្រីបទៅជាឈុតដែលមានរចនាសម្ព័ន្ធ និងការណែនាំរូបភាពនិងចលនា។"],
    },
  },
} as const;

const getTools = () => [
  { id: "prompt-enhancer", type: "prompt", cat: "Text", title: "Prompt Enhancer", desc: "Turn simple ideas into detailed, generation-ready prompts.", iconSrc: "/icons/4.png", data: { title: "Text* Prompt Enhancer" } },
  { id: "image-to-prompt", type: "text", cat: "Text", title: "Image to Prompt", desc: "Turn a reference image into a detailed generation prompt.", iconSrc: "/icons/4.png", data: { title: "Text* Image to Prompt", instruction: "Analyze the connected reference image and write a detailed generation prompt." } },
  { id: "upload-image", type: "upload_image", cat: "Upload", title: "Upload Image", desc: "Use a local image file in your canvas.", iconSrc: "/icons/normal.png" },
  { id: "image-generation", type: "image", cat: "Image", title: "Image Generation", desc: "Create images from text prompts or reference images.", iconSrc: "/icons/2.png", data: { title: "Image* Image Generation", imageGenerationMode: "generation" as const, model: "gpt-image-2(tokenstar)", size: "2048x2048" } },
  { id: "specialized-image-tools", type: "image", cat: "Image", title: "Specialized Image Tools", desc: "Create consistent character, scene, and spatial reference images.", iconSrc: "/icons/2.png", data: { title: "Image* Specialized Image Tools", imageGenerationMode: "specialized" as const, imagePromptPreset: "character-turnaround" as const, model: "gpt-image-2(tokenstar)", size: "2048x2048", prompt: "" } },
  { id: "upload-video", type: "upload_video", cat: "Upload", title: "Upload Video", desc: "Use a local video file in your canvas.", iconSrc: "/icons/1.png" },
  { id: "video-generation", type: "video", cat: "Video", title: "Video Generation", desc: "Create videos from text, images, or audio.", iconSrc: "/icons/1.png", data: { title: "Video* Video Generation", videoGenerationMode: "general" as const, ...videoModelPatch(DEFAULT_VIDEO_MODEL_PRESET_ID) } },
  { id: "video-edit", type: "videoEdit", cat: "Video", title: "Video Edit", desc: "Visual sequencing, trimming, transitions, music, subtitles, and transcoding.", iconSrc: "/icons/1.png", data: { title: "Video* Video Edit", videoEditMode: "quick" as const, editPlan: "", preserveAudio: true, originalVolume: 1, backgroundVolume: 0.2, fadeIn: 0, fadeOut: 0, transition: "none", resolution: "720p", fps: "30", aspectRatio: "16:9" } },
  { id: "extract-frames", type: "videoFrame", cat: "Video", title: "Extract Frames", desc: "Connect a video and extract the current or final frame.", iconSrc: "/icons/1.png", data: { title: "Video* Extract Frames", frameMode: "last" as const } },
  { id: "upload-audio", type: "upload_audio", cat: "Upload", title: "Upload Audio", desc: "Use a local audio file as BGM or reference audio", iconSrc: "/icons/3.png" },
  { id: "voice-cloning", type: "voiceClone", cat: "Audio", title: "Voice Cloning", desc: "Create a voice from authorized audio.", iconSrc: "/icons/3.png", data: { title: "Audio* Voice Cloning" } },
  { id: "text-to-speech", type: "audio", cat: "Audio", title: "Text-to-Speech", desc: "Convert text into natural-sounding speech.", iconSrc: "/icons/3.png", data: { title: "Audio* Text-to-Speech", ttsMode: "quick" as const, prompt: "", model: "TTS" } },
  { id: "music-generation", type: "musicGeneration", cat: "Audio", title: "Music Generation", desc: "Create music from styles, tags, and song sections.", iconSrc: "/icons/3.png", data: { title: "Audio* Music Generation", musicName: "mindverse_track", musicTags: "cinematic, warm, mid tempo, instrumental", prompt: "[intro];[verse] A gentle theme begins;[chorus] The melody opens into a memorable hook;[outro];" } },
  { id: "story-generator", type: "script", cat: "Story", title: "Story Generator", desc: "Develop an original story and script from a creative idea.", iconSrc: "/icons/5.png", data: { title: "Story* Story Generator" } },
  { id: "storyboard-generator", type: "storyboard", cat: "Story", title: "Storyboard Generator", desc: "Turn a script into structured shots with visual and motion directions.", iconSrc: "/icons/5.png", data: { title: "Story* Storyboard Generator" } },
];

export function AddNodeMenu({ x, y, onClose }: { x: number; y: number; onClose: () => void }) {
  const { lang, t } = useLang();
  const localized = menuCopy[lang];
  const [activeCat, setActiveCat] = useState("Video");
  const [search, setSearch] = useState("");
  const [keepOpen, setKeepOpen] = useState(false);
  
  const setGhostType = useCanvasStore(s => s.setGhostType);
  const setGhostMedia = useCanvasStore(s => s.setGhostMedia);
  const fileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);
  const audioFileRef = useRef<HTMLInputElement>(null);

  const allTools = useMemo(() => getTools(), []);

  const filtered = useMemo(() => {
    if (search.trim()) return allTools.filter(tool => {
      const copy = localized.tools[tool.id as keyof typeof localized.tools];
      return `${copy?.[0] || tool.title} ${copy?.[1] || tool.desc}`.toLowerCase().includes(search.toLowerCase());
    });
    return allTools.filter(tool => tool.cat === activeCat);
  }, [activeCat, search, allTools, localized]);

  const handleToolClick = (tool: ReturnType<typeof getTools>[0]) => {
    if (tool.type === "upload_image") {
      fileRef.current?.click();
      return;
    }
    if (tool.type === "upload_video") {
      videoFileRef.current?.click();
      return;
    }
    if (tool.type === "upload_audio") {
      audioFileRef.current?.click();
      return;
    }
    // Set ghost type based on tool.type
    // A future enhancement could inject provider defaults into the node
    setGhostType(tool.type as NodeType, "data" in tool ? tool.data as Partial<CanvasNodeData> : undefined);
    if (!keepOpen) onClose();
  };

  const archiveLocalImage = (file: File) => archiveImageFile(file);
  const archiveLocalVideo = (file: File) => archiveVideoFile(file);
  const archiveLocalAudio = (file: File) => archiveAudioFile(file);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []).filter(f => /^image\//.test(f.type));
    files.forEach((file) => {
      void (async () => {
        try {
          const url = await archiveLocalImage(file);
          setGhostMedia(url);
        } catch (error) {
          console.error("Local image archive failed", error);
          useCanvasStore.setState({ lastError: "Image archiving failed, so it was not added to the canvas. Check the Bunny Storage configuration and try again." });
        }
      })();
    });
    e.target.value = "";
    if (!keepOpen) onClose();
  };

  const handleAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = Array.from(e.target.files ?? []).find(f => /^audio\//.test(f.type));
    if (file) {
      void (async () => {
        try {
          const url = await archiveLocalAudio(file);
          setGhostType("audio", {
            title: `Audio* ${file.name.replace(/\.[^.]+$/, "") || "Uploaded Audio"}`,
            prompt: "",
            status: "success",
            output: {
              kind: "audio",
              summary: "Audio uploaded",
              value: { audioUrl: url, originalFileName: file.name, sourceProvider: "local-upload" },
              createdAt: new Date().toISOString(),
            },
          });
        } catch (error) {
          console.error("Local audio archive failed", error);
        }
      })();
    }
    e.target.value = "";
    if (!keepOpen) onClose();
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = Array.from(e.target.files ?? []).find((item) =>
      /^video\//.test(item.type) || /\.(mp4|webm|mov|m4v)$/i.test(item.name),
    );
    if (file) {
      void (async () => {
        try {
          const url = await archiveLocalVideo(file);
          setGhostType("video", {
            title: `Video* ${file.name.replace(/\.[^.]+$/, "") || "Uploaded Video"}`,
            prompt: "",
            status: "success",
            output: {
              kind: "video",
              summary: "Video uploaded",
              value: {
                videoUrl: url,
                resultUrl: url,
                originalFileName: file.name,
                sourceProvider: "local-upload",
              },
              createdAt: new Date().toISOString(),
            },
          });
        } catch (error) {
          console.error("Local video archive failed", error);
        }
      })();
    }
    e.target.value = "";
    if (!keepOpen) onClose();
  };

  // Prevent menu going offscreen
  const menuWidth = 500;
  const menuHeight = 400;
  let finalX = x;
  let finalY = y;
  if (typeof window !== "undefined") {
    if (finalX + menuWidth > window.innerWidth) finalX = window.innerWidth - menuWidth - 20;
    if (finalY + menuHeight > window.innerHeight) finalY = window.innerHeight - menuHeight - 20;
  }

  return (
    <div className="fixed z-[9999] flex flex-col overflow-hidden rounded-xl border border-[#e7eaf0] bg-white shadow-2xl dark:border-slate-700 dark:bg-[#101c29]"
         style={{ left: finalX, top: finalY, width: menuWidth, height: menuHeight }}
         onMouseDown={e => e.stopPropagation()}
         onContextMenu={e => e.preventDefault()}
    >
      {/* Search */}
      <div className="flex shrink-0 items-center border-b border-[#e7eaf0] px-3 py-2.5 dark:border-slate-800">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mr-2 text-slate-400">
          <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
        </svg>
        <input 
          autoFocus
          className="flex-1 bg-transparent text-sm text-[#030303] placeholder-slate-400 outline-none dark:text-slate-100" 
          placeholder={t.menuSearch}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      <div className="flex flex-1 min-h-0 bg-[#f8f9fa] dark:bg-[#0c1622]">
        {/* Left Categories */}
        <div className="w-40 shrink-0 overflow-y-auto py-2">
          {ALL_CATEGORIES.map(c => {
            return (
              <button key={c} onClick={() => { setActiveCat(c); setSearch(""); }}
                className={`flex w-full items-center px-4 py-2 text-xs font-semibold ${
                  activeCat === c ? "relative text-[#030303] dark:text-cyan-300" : "text-[#676f7b] hover:text-[#030303] dark:text-slate-400 dark:hover:text-slate-200"
                }`}
              >
                {activeCat === c && <div className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 bg-[#030303] dark:bg-cyan-400"/>}
                {localized.categories[c]}
              </button>
            )
          })}
        </div>

        {/* Right Content */}
        <div className="flex-1 overflow-y-auto bg-white p-3 dark:bg-[#101c29]">
          {filtered.length === 0 && <p className="mt-10 text-center text-xs text-slate-400">{t.menuNoResults}</p>}
          <div className="space-y-2">
            {filtered.map(tool => {
              const display = localized.tools[tool.id as keyof typeof localized.tools];
              return (
              <button key={tool.id} onClick={() => handleToolClick(tool)} className="flex w-full items-center gap-3 rounded-xl border border-[#e7eaf0] p-2.5 text-left transition hover:border-[#c9ccd1] hover:shadow-sm dark:border-slate-700 dark:hover:border-slate-500">
                <div className="shrink-0 overflow-hidden rounded-lg">
                  <img src={tool.iconSrc} alt="" className="h-10 w-10 object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="truncate text-xs font-bold text-[#030303] dark:text-slate-100">{display?.[0] || tool.title}</p>
                  <p className="truncate text-[10px] text-[#676f7b] dark:text-slate-500">{display?.[1] || tool.desc}</p>
                </div>
                <svg width="8" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-[#c9ccd1] dark:text-slate-600">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            )})}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex shrink-0 items-center justify-between border-t border-[#e7eaf0] bg-white px-4 py-3 dark:border-slate-800 dark:bg-[#101c29]">
        <span className="text-xs text-[#676f7b] dark:text-slate-400">{t.menuKeepOpen}</span>
        <button onClick={() => setKeepOpen(!keepOpen)} className={`relative h-5 w-9 rounded-full transition-colors ${keepOpen ? "bg-[#030303] dark:bg-cyan-500" : "bg-[#c9ccd1] dark:bg-slate-600"}`}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${keepOpen ? "translate-x-[18px]" : "translate-x-0.5"}`} />
        </button>
      </div>

      <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif" multiple className="hidden" onChange={handleFileUpload} />
      <input ref={videoFileRef} type="file" accept="video/mp4,video/webm,video/quicktime,video/x-m4v,.mp4,.webm,.mov,.m4v" className="hidden" onChange={handleVideoUpload} />
      <input ref={audioFileRef} type="file" accept="audio/mpeg,audio/mp3,audio/wav,audio/aac,audio/flac,audio/mp4,.mp3,.wav,.aac,.flac,.m4a" className="hidden" onChange={handleAudioUpload} />
    </div>
  );
}
