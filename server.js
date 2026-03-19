require("dotenv").config();

const express = require("express");
const OpenAI = require("openai");
const path = require("path");
const { setTimeout: delay } = require("timers/promises");

const app = express();
const port = process.env.PORT || 3000;
const model = process.env.MINIMAX_MODEL || "MiniMax-M2.5";

const client = process.env.MINIMAX_API_KEY
  ? new OpenAI({
      apiKey: process.env.MINIMAX_API_KEY,
      baseURL: "https://api.minimaxi.com/v1",
    })
  : null;

const policyCache = new Map();
const policyCacheTtlMs = 1000 * 60 * 60 * 6;

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/analyze", async (req, res) => {
  if (!client) {
    return res.status(500).json({
      error: "Server is missing MINIMAX_API_KEY. Set it in your environment before starting.",
    });
  }

  const data = sanitizeInput(req.body || {});
  const missingFields = getMissingFields(data);

  if (missingFields.length) {
    return res.status(400).json({
      error: `Missing required fields: ${missingFields.join(", ")}`,
    });
  }

  const policyContext = await getPolicyContext(data);
  const draft = buildHeuristicDraft(data, policyContext);
  const prompt = buildPrompt(data, draft, policyContext);

  try {
    const response = await client.chat.completions.create({
      model,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const text = extractOutputText(response);
    const parsed = parseModelJson(text);
    const score = clampScore(Number(parsed.score) || draft.score);
    const level = normalizeLevel(parsed.level, score);

    res.json({
      score,
      level,
      engineLabel: `分析方式：MiniMax 实时分析 (${model}${policyContext.labelSuffix})`,
      title: parsed.title || draft.title,
      description: parsed.description || draft.description,
      reasons: ensureList(parsed.reasons, draft.reasons),
      cityInsights: ensureList(parsed.cityInsights, draft.cityInsights),
      companyInsights: ensureList(parsed.companyInsights, draft.companyInsights),
      strengths: ensureList(parsed.strengths, draft.strengths),
      actions: ensureList(parsed.actions, draft.actions),
      nextPath: parsed.nextPath || draft.nextPath,
    });
  } catch (error) {
    console.error("Analyze error:", error);
    res.status(500).json({
      error: "MiniMax analysis failed. Check your model, API key, and server logs.",
      detail: error.message,
    });
  }
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(port, () => {
  console.log(`AI job risk app running on http://localhost:${port}`);
});

function sanitizeInput(input) {
  return {
    jobTitle: String(input.jobTitle || "").trim(),
    province: String(input.province || "").trim(),
    city: String(input.city || "").trim(),
    age: Number(input.age || 0),
    industry: String(input.industry || "").trim(),
    experience: String(input.experience || "").trim(),
    tasks: String(input.tasks || "").trim(),
    repeatability: Number(input.repeatability || 0),
    creativity: Number(input.creativity || 0),
    humanFactor: Number(input.humanFactor || 0),
    digitization: Number(input.digitization || 0),
  };
}

function getMissingFields(data) {
  const required = [
    "jobTitle",
    "province",
    "city",
    "age",
    "industry",
    "experience",
    "tasks",
    "repeatability",
    "creativity",
    "humanFactor",
    "digitization",
  ];

  return required.filter((key) => !data[key]);
}

const keywords = {
  highRisk: ["录入", "报表", "客服", "整理", "审核", "文案", "翻译", "运营", "数据标注", "工单"],
  lowRisk: ["管理", "销售", "咨询", "医生", "护理", "教师", "研发", "设计", "谈判", "领导", "培训"],
};

const industryBias = {
  "互联网平台": 10,
  "软件/IT 服务": 9,
  "AI / 大模型": 12,
  "金融财务": 12,
  "银行 / 证券 / 保险": 11,
  "电商零售": 8,
  "制造业": 8,
  "机械设备 / 自动化": 8,
  "电子 / 半导体": 9,
  "物流/供应链": 7,
  "媒体/内容": 10,
  "广告 / 营销": 9,
  "教育培训": 2,
  "医疗健康": -6,
  "房地产 / 建筑": 4,
  "政务/公共服务": -4,
  "餐饮 / 酒旅 / 服务业": 5,
  "外贸 / 跨境": 8,
  "能源 / 化工": 6,
  "汽车 / 新能源": 8,
  "农业 / 食品": 4,
  "其他": 4,
};

const experienceBias = {
  "0-1": 10,
  "1-3": 7,
  "3-5": 2,
  "5-10": -4,
  "10+": -8,
};

const cityProfiles = {
  北京: {
    direction: "平台经济、金融服务、总部经济和政务资源仍然很强",
    policy: "更强调高端服务业、数字经济和创新型岗位集聚",
    adjustment: 0,
  },
  上海: {
    direction: "金融、总部、先进制造和国际化服务业更成熟",
    policy: "更利好高附加值岗位和跨职能整合型人才",
    adjustment: -1,
  },
  深圳: {
    direction: "硬科技、跨境、电商、制造升级和自动化落地速度很快",
    policy: "对效率工具、自动化和新技术岗位接受度很高",
    adjustment: 4,
  },
  广州: {
    direction: "商贸、消费、制造和服务业并存，岗位结构更综合",
    policy: "一边促消费，一边推动数字化升级",
    adjustment: 1,
  },
  杭州: {
    direction: "电商、平台、内容和数字化业务密集",
    policy: "对运营、内容、产品类岗位的 AI 重构速度通常更快",
    adjustment: 4,
  },
  成都: {
    direction: "新经济、软件、消费服务和区域总部岗位都在增长",
    policy: "对复合型人才更友好，纯执行岗位竞争会逐渐加剧",
    adjustment: 1,
  },
  苏州: {
    direction: "先进制造、供应链和工业体系更强",
    policy: "制造业数字化升级会持续影响流程型岗位",
    adjustment: 3,
  },
  东莞: {
    direction: "制造业、自动化和工厂端提效需求非常强",
    policy: "标准化、可量化岗位更容易被自动化改造",
    adjustment: 4,
  },
  武汉: {
    direction: "科教、制造、研发和区域服务中心都比较均衡",
    policy: "技术与产业并进，对中高级专业岗位更有承接力",
    adjustment: 0,
  },
  南京: {
    direction: "软件、教育、制造和研发资源都比较稳",
    policy: "更适合专业能力和跨职能协同兼具的人才",
    adjustment: 0,
  },
};

const citySearchProfiles = {
  苏州: {
    labelSuffix: " · 苏州政策增强试点",
    scoreAdjustment: {
      "制造业": 5,
      "机械设备 / 自动化": 5,
      "电子 / 半导体": 4,
      "软件/IT 服务": 2,
      "AI / 大模型": 2,
      "物流/供应链": 2,
    },
    sources: [
      {
        title: "智造苏州 向“新”而跃",
        url: "https://www.suzhou.gov.cn/szsrmzf/szyw/202505/5dd231e834c141a69252fc2578130c4b.shtml",
        note: "2025 年官方报道，强调工业互联网、智造十大行动、5G 工厂和中小企业数字化转型。",
        keywords: ["新型工业化", "工业互联网", "数字化转型", "5G工厂", "智能化改造"],
      },
      {
        title: "2025 年苏州市级预算草案说明事项",
        url: "https://www.suzhou.gov.cn/szsrmzf/czyjsbg/202502/e4d4339343ca471ca41096fa89b006bf/files/7411c4e263694d40ac118eae0c20d70f.pdf",
        note: "2025 年预算草案公开文件，可用于观察重点项目和财政资源倾斜方向。",
        keywords: ["产业", "制造业", "数字化", "工业", "科技"],
      },
    ],
    preferredDomains: ["suzhou.gov.cn"],
  },
};

function buildHeuristicDraft(data, policyContext) {
  const taskText = `${data.jobTitle} ${data.tasks}`.toLowerCase();
  let score = 45;

  score += data.repeatability * 8;
  score += data.digitization * 6;
  score -= data.creativity * 7;
  score -= data.humanFactor * 6;
  score += industryBias[data.industry] || 0;
  score += experienceBias[data.experience] || 0;
  score += getCityProfile(data.city).adjustment;
  score += policyContext.scoreAdjustment;

  keywords.highRisk.forEach((word) => {
    if (taskText.includes(word)) {
      score += 4;
    }
  });

  keywords.lowRisk.forEach((word) => {
    if (taskText.includes(word)) {
      score -= 4;
    }
  });

  if (data.age <= 24) {
    score += 4;
  } else if (data.age >= 38) {
    score -= 2;
  }

  score = clampScore(score);
  const level = normalizeLevel("", score);

  return {
    score,
    level,
    title: `${data.city}${data.jobTitle} 的 AI 替代风险为「${level.label}」`,
    description: `${level.description} 结合你填写的岗位特征来看，AI 更可能先替代你工作中标准化、重复性强、可线上完成的环节，而不是一次性完整取代整份工作。`,
    reasons: buildReasons(data, score),
    cityInsights: buildCityInsights(data, score, policyContext),
    companyInsights: buildCompanyInsights(data, score, policyContext),
    strengths: buildStrengths(data, score),
    actions: buildActions(data, score),
    nextPath: buildNextPath(data, score),
  };
}

function buildPrompt(data, draft, policyContext) {
  return `
  你是一个职业风险分析顾问。请根据用户资料，判断这个岗位被 AI 替代的风险，并输出严格 JSON。
  你还需要结合工作城市、所在行业、岗位内容，谨慎推断当地发展环境和公司是否可能继续重视这个岗位。
  如果信息不足，不要装作确定，请用“更可能”“大概率”“倾向于”这类表达。

输出要求：
1. 只输出 JSON，不要输出 markdown，不要加解释。
2. 字段必须完整：
{
  "score": 0-100 的整数,
  "level": "高风险" | "中等风险" | "低风险",
  "title": "一句总结标题",
  "description": "2-3 句结果综述",
  "reasons": ["原因1", "原因2", "原因3"],
  "cityInsights": ["城市判断1", "城市判断2", "城市判断3"],
  "companyInsights": ["公司判断1", "公司判断2", "公司判断3"],
  "strengths": ["优势1", "优势2", "优势3"],
  "actions": ["建议1", "建议2", "建议3"],
  "nextPath": "一段升级方向建议"
}
3. 结论要具体，避免空话，语气要像面向大众用户的职业分析网页。

  用户资料：
  ${JSON.stringify(data, null, 2)}

  政策与城市补充上下文：
  ${JSON.stringify(policyContext.promptContext, null, 2)}
  
  你可以参考下面这个启发式初稿，但不要机械重复：
${JSON.stringify(
      {
        score: draft.score,
        level: draft.level.label,
        reasons: draft.reasons,
        cityInsights: draft.cityInsights,
        companyInsights: draft.companyInsights,
        strengths: draft.strengths,
        actions: draft.actions,
        nextPath: draft.nextPath,
    },
    null,
    2
  )}
`;
}

function extractOutputText(response) {
  const content = response?.choices?.[0]?.message?.content;

  if (typeof content === "string" && content.trim()) {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }

        if (item?.type === "text" && item?.text) {
          return item.text;
        }

        return "";
      })
      .join("\n")
      .trim();
  }

  return "";
}

function parseModelJson(text) {
  if (!text) {
    throw new Error("Model returned empty output.");
  }

  const cleaned = text
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/^```json\s*/i, "")
    .replace(/```$/i, "")
    .trim();
  const jsonText = extractFirstJsonObject(cleaned);

  if (!jsonText) {
    throw new Error("Could not parse model output into JSON.");
  }

  return JSON.parse(jsonText);
}

function extractFirstJsonObject(text) {
  const start = text.indexOf("{");

  if (start === -1) {
    return "";
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const char = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (char === "\\") {
        escaped = true;
      } else if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;

      if (depth === 0) {
        return text.slice(start, i + 1);
      }
    }
  }

  return "";
}

function normalizeLevel(label, score) {
  if (label === "高风险" || score >= 75) {
    return {
      label: "高风险",
      description: "你的岗位中存在不少可被自动化和生成式 AI 接管的任务。",
    };
  }

  if (label === "中等风险" || score >= 50) {
    return {
      label: "中等风险",
      description: "AI 很可能重构你的工作流程，但短期内更像是替代部分环节。",
    };
  }

  return {
    label: "低风险",
    description: "你的岗位更依赖复杂判断、创造力或高质量的人际互动。",
  };
}

function clampScore(score) {
  return Math.max(1, Math.min(99, Math.round(score)));
}

function ensureList(value, fallback) {
  if (!Array.isArray(value) || !value.length) {
    return fallback;
  }

  return value.filter(Boolean).slice(0, 4);
}

function buildReasons(data, score) {
  const items = [];

  if (data.repeatability >= 4) {
    items.push("你的日常工作重复度较高，说明流程化、模板化任务占比较大，这类任务最容易被 AI 工具接手。");
  }
  if (data.digitization >= 4) {
    items.push("你的岗位高度数字化，工作信息主要在线上流转，意味着 AI 更容易直接进入工作链路。");
  }
  if (/(写|整理|录入|分析|客服|报表|审核|文案|运营)/.test(data.tasks)) {
    items.push("你填写的工作内容中包含文本生成、资料整理、基础分析或标准应答，这些正是当前 AI 进步最快的区域。");
  }
  if (score >= 70) {
    items.push("从整体结构看，你的岗位更像是“部分技能组合”而不是“高度不可拆分的专业判断”，因此更容易被分阶段替代。");
  }
  if (!items.length) {
    items.push("你的岗位虽然不是最典型的高风险职业，但其中仍存在可被 AI 辅助或替代的标准化流程。");
  }

  return items.slice(0, 4);
}

function buildCityInsights(data, score, policyContext) {
  const profile = getCityProfile(data.city);
  const items = [
    `${data.city}当前更偏向${profile.direction}，这会直接影响你所在岗位未来是被削减、被重构，还是被升级。`,
    `${data.city}的政策和产业走向通常${profile.policy}，所以同样的岗位，在这里未必会走出和其他城市一样的路径。`,
  ];

  if (policyContext.summaries.length) {
    items.push(`结合${data.city}近两年的公开政策摘要来看，${policyContext.summaries[0]}`);
  }

  if (profile.adjustment >= 3) {
    items.push("从城市环境看，你所在地区对数字化、自动化和流程提效的接受度较高，这会放大岗位被 AI 重构的速度。");
  } else if (profile.adjustment <= -1) {
    items.push("从城市环境看，当地更需要高附加值、复杂协同和专业判断型人才，这会在一定程度上减缓纯岗位替代的速度。");
  } else {
    items.push("从城市环境看，你的风险不会只由岗位决定，还会受到城市产业结构是否继续扩张的影响。");
  }

  if (["制造业", "机械设备 / 自动化", "电子 / 半导体"].includes(data.industry)) {
    items.push("如果你所在城市正推动制造升级，那么流程型、支持型岗位会先被重构，而懂现场、懂工艺、懂协同的人会更值钱。");
  }

  return items.slice(0, 4);
}

function buildCompanyInsights(data, score, policyContext) {
  const items = [];
  const taskText = `${data.jobTitle} ${data.tasks}`;
  const likelyCore = /(客户|销售|方案|研发|产品|项目|工艺|设计|医生|教师|咨询)/.test(taskText);
  const likelySupport = /(录入|报表|整理|审核|客服|工单|跟单|基础运营)/.test(taskText);
  const fastAutomation =
    ["互联网平台", "AI / 大模型", "软件/IT 服务", "电商零售", "媒体/内容"].includes(data.industry) ||
    score >= 70;

  if (likelyCore) {
    items.push("从岗位内容看，你更像是在直接支撑客户、产品、方案或关键交付，这类岗位通常比纯支持型岗位更容易获得持续投入。");
  } else if (likelySupport) {
    items.push("从岗位内容看，你当前承担的工作更偏流程支持和标准执行，公司未来更可能优先优化这部分编制和流程。");
  } else {
    items.push("仅从公开可见的岗位信息判断，你的岗位更像处在“可被优化，但未必会被立刻放弃”的区间，公司态度大概率取决于业务阶段。");
  }

  if (fastAutomation) {
    items.push("结合行业属性看，这类公司往往会更快引入 AI 和自动化工具，所以公司未必会减少这个岗位，但很可能会提高对人效的要求。");
  } else {
    items.push("结合行业属性看，这类公司对 AI 的改造速度未必是最快的，因此公司更可能先做局部辅助，而不是马上重做整条岗位链路。");
  }

  if (score >= 72) {
    items.push("如果公司当前经营压力偏大或更强调降本，这个岗位被要求“一个人做更多事”的概率会比较高，培养意愿通常不会特别强。");
  } else if (score <= 45) {
    items.push("如果公司把这个岗位视为连接客户、结果或专业判断的重要节点，那么继续培养你的概率会明显高于直接替换。");
  } else {
    items.push("更现实的情况往往不是“留或不留”，而是公司会继续保留岗位，但要求你更会用 AI、更能承担复杂部分。");
  }

  if (policyContext.summaries.length && fastAutomation) {
    items.push(`再结合${data.city}当前的政策倾向看，公司更可能把资源投向提效、数字化和核心增长岗位，而不是长期保留大量纯流程型岗位。`);
  }

  return items.slice(0, 4);
}

function buildStrengths(data, score) {
  const items = [];

  if (data.creativity >= 4) {
    items.push("你的工作对创造力要求偏高，说明“提出新方案”和“形成独特表达”仍然是人的核心优势。");
  }
  if (data.humanFactor >= 4) {
    items.push("你的岗位高度依赖沟通、说服、共情或现场判断，这部分通常很难被纯自动化系统完整复制。");
  }
  if (["教育培训", "医疗健康", "政务/公共服务"].includes(data.industry)) {
    items.push("你所在行业对责任归属、信任关系和人工把关要求更高，因此 AI 更适合辅助，而不是完全替代。");
  }
  if (["5-10", "10+"].includes(data.experience)) {
    items.push("你的工作年限意味着你可能已经积累了经验判断和场景处理能力，这比单纯执行更难被复制。");
  }
  if (score < 50) {
    items.push("从整体看，你的岗位价值更集中在复杂协作和非标准问题处理上，这类能力仍然具备明显护城河。");
  }
  if (!items.length) {
    items.push("你的岗位并不是一种可以被单一模型立即完整接管的工作，现实中更可能先被 AI 改造流程，而不是被整体替代。");
  }

  return items.slice(0, 4);
}

function buildActions(data, score) {
  const items = [
    "把你当前岗位中最重复、最标准化的 3 类任务列出来，优先学会用 AI 提升这些环节的效率，而不是等它来替代你。",
  ];

  if (score >= 70) {
    items.push("尽快从“执行者”转向“问题定义者”，提升需求判断、质量把控、业务理解和结果负责能力。");
    items.push("补上数据分析、AI 工具编排、工作流自动化这些新型基础能力，让自己从被替代对象变成 AI 的使用者。");
  } else {
    items.push("把 AI 当成副驾驶，主动建立自己的提示词模板、分析流程和交付方法，形成效率差。");
  }

  if (data.humanFactor <= 3) {
    items.push("有意识地增强跨部门沟通、客户理解、协作推动能力，因为这类价值通常比单点技能更难被机器替代。");
  }
  if (data.creativity <= 3) {
    items.push("尝试在工作中增加方案设计、策略思考和复盘输出的比重，让你的岗位从“执行型”升级为“决策支持型”。");
  }
  if (score >= 70) {
    items.push("如果你已经感受到公司开始强调效率、压缩流程或提高人效，就不要只等公司安排，尽快准备可迁移能力、作品案例和外部机会。");
  }
  if (/(录入|整理|报表|审核|客服|工单|基础运营)/.test(data.tasks)) {
    items.push("主动把自己和核心业务绑得更紧，比如接近客户、接近收入、接近关键交付，这比只把手上活做完更重要。");
  }

  return items.slice(0, 4);
}

function buildNextPath(data, score) {
  if (score >= 75) {
    return `你的下一步更适合从“纯执行岗位”转向“AI 增强岗位”。例如：${data.jobTitle} + 自动化、${data.jobTitle} + 数据分析、${data.jobTitle} + 项目协同。核心目标不是和 AI 拼速度，而是让自己站到“设计流程、管理结果、判断风险”的位置。`;
  }
  if (score >= 50) {
    return "你的岗位大概率会被 AI 重塑，而不是直接消失。更稳妥的升级路径是把自己变成会用 AI 的专业人士：保留行业知识，同时提高系统思维、交付整合和复杂问题解决能力。";
  }
  return "你的岗位短期内不容易被完整替代，但依然会被 AI 提高门槛。更好的方向是继续强化你的专业判断与人际影响力，再把 AI 作为效率放大器，形成“专业深度 + 工具杠杆”的组合优势。";
}

function getCityProfile(city) {
  return (
    cityProfiles[city] || {
      direction: "区域产业升级、数字化改造和本地需求变化",
      policy: "会同时看重效率提升和产业承接能力",
      adjustment: 1,
    }
  );
}

async function getPolicyContext(data) {
  const cityResearch = citySearchProfiles[data.city];

  if (!cityResearch) {
    return {
      labelSuffix: "",
      scoreAdjustment: 0,
      summaries: [],
      promptContext: {
        mode: "generic-city-inference",
        note: "当前城市没有接入专项政策快照，只能基于城市产业特征做谨慎推断。",
      },
    };
  }

  const cacheKey = `${data.city}:${data.industry}`;
  const cached = policyCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < policyCacheTtlMs) {
    return cached.value;
  }

  const liveResearch = await fetchPolicyResearch(data, cityResearch);

  const value = {
    labelSuffix: cityResearch.labelSuffix || "",
    scoreAdjustment: cityResearch.scoreAdjustment[data.industry] || 0,
    summaries: liveResearch.summaries,
    promptContext: {
      mode: liveResearch.isLive ? "city-policy-live-fetch" : "city-policy-source-fallback",
      city: data.city,
      industry: data.industry,
      policySummaries: liveResearch.summaries,
      officialSources: liveResearch.sources,
      industryAdjustment: cityResearch.scoreAdjustment[data.industry] || 0,
    },
  };

  policyCache.set(cacheKey, {
    timestamp: Date.now(),
    value,
  });

  return value;
}

async function fetchPolicyResearch(data, cityResearch) {
  const searchResults = await searchPolicySources(data, cityResearch);
  const combinedSources = dedupeSources([...(searchResults || []), ...cityResearch.sources]);

  const results = await Promise.all(
    combinedSources.map(async (source) => {
      try {
        const excerpt = await fetchSourceExcerpt(source);
        return {
          title: source.title,
          url: source.url,
          note: source.note,
          excerpt,
        };
      } catch (_error) {
        return {
          title: source.title,
          url: source.url,
          note: source.note,
          excerpt: "",
        };
      }
    })
  );

  const liveSummaries = results
    .filter((item) => item.excerpt)
    .map((item) => `${item.title} 提到：${item.excerpt}`);

  if (liveSummaries.length) {
    return {
      isLive: true,
      summaries: liveSummaries.slice(0, 3),
      sources: results,
    };
  }

  return {
    isLive: false,
    summaries: combinedSources.map((item) => item.note).slice(0, 3),
    sources: results,
  };
}

async function searchPolicySources(data, cityResearch) {
  const queries = buildPolicyQueries(data);
  const buckets = await Promise.all(
    queries.map((query) => searchDuckDuckGo(query, cityResearch.preferredDomains || []))
  );

  return dedupeSources(
    buckets
      .flat()
      .filter((item) => isAllowedPolicyResult(item.url, cityResearch.preferredDomains || []))
      .slice(0, 6)
  );
}

function buildPolicyQueries(data) {
  const industryKeyword = normalizeIndustryKeyword(data.industry);
  return [
    `${data.city} 政府工作报告 ${industryKeyword}`,
    `${data.city} ${industryKeyword} 数字化转型 政策`,
    `${data.city} ${data.jobTitle} 产业 政策`,
  ];
}

function normalizeIndustryKeyword(industry) {
  if (industry.includes("制造")) {
    return "制造业";
  }
  if (industry.includes("软件") || industry.includes("IT")) {
    return "软件产业";
  }
  if (industry.includes("媒体") || industry.includes("内容")) {
    return "文化产业";
  }
  if (industry.includes("电商")) {
    return "数字经济";
  }
  return industry;
}

async function searchDuckDuckGo(query, preferredDomains) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 AI-Job-Risk-Checker/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.status}`);
    }

    const html = await response.text();
    return extractSearchResults(html, preferredDomains);
  } catch (_error) {
    return [];
  } finally {
    clearTimeout(timeout);
    await delay(50);
  }
}

function extractSearchResults(html, preferredDomains) {
  const results = [];
  const regex = /<a[^>]*class="[^"]*result__a[^"]*"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let match;

  while ((match = regex.exec(html)) !== null) {
    const rawHref = match[1];
    const title = normalizeFetchedText(match[2]);
    const url = decodeSearchHref(rawHref);

    if (!url) {
      continue;
    }

    if (preferredDomains.length && !isAllowedPolicyResult(url, preferredDomains)) {
      continue;
    }

    results.push({
      title: title || "政策搜索结果",
      url,
      note: `自动搜索命中：${title || url}`,
      keywords: ["政策", "工作报告", "数字化", "产业", "制造业", "智能化"],
    });

    if (results.length >= 4) {
      break;
    }
  }

  return results;
}

function decodeSearchHref(rawHref) {
  try {
    if (rawHref.startsWith("//")) {
      rawHref = `https:${rawHref}`;
    }
    const url = new URL(rawHref);
    const redirect = url.searchParams.get("uddg");
    return redirect ? decodeURIComponent(redirect) : rawHref;
  } catch (_error) {
    return rawHref.startsWith("http") ? rawHref : "";
  }
}

function isAllowedPolicyResult(url, preferredDomains) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, "");
    if (preferredDomains.length) {
      return preferredDomains.some((domain) => host === domain || host.endsWith(`.${domain}`));
    }
    return host.endsWith(".gov.cn") || host.includes("gov.cn");
  } catch (_error) {
    return false;
  }
}

function dedupeSources(items) {
  const seen = new Set();
  return items.filter((item) => {
    if (!item?.url || seen.has(item.url)) {
      return false;
    }
    seen.add(item.url);
    return true;
  });
}

async function fetchSourceExcerpt(source) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);

  try {
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 AI-Job-Risk-Checker/1.0",
      },
    });

    if (!response.ok) {
      throw new Error(`Fetch failed: ${response.status}`);
    }

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("pdf")) {
      return source.note;
    }

    const html = await response.text();
    const text = normalizeFetchedText(html);
    return extractRelevantSnippet(text, source.keywords || []) || source.note;
  } finally {
    clearTimeout(timeout);
    await delay(50);
  }
}

function normalizeFetchedText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function extractRelevantSnippet(text, keywords) {
  for (const keyword of keywords) {
    const index = text.indexOf(keyword);
    if (index !== -1) {
      const start = Math.max(0, index - 50);
      const end = Math.min(text.length, index + 180);
      return text.slice(start, end).trim();
    }
  }

  return text.slice(0, 220).trim();
}
   
