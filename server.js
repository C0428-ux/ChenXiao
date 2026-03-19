require("dotenv").config();

const express = require("express");
const OpenAI = require("openai");
const path = require("path");

const app = express();
const port = process.env.PORT || 3000;
const model = process.env.MINIMAX_MODEL || "MiniMax-M2.5";

const client = process.env.MINIMAX_API_KEY
  ? new OpenAI({
      apiKey: process.env.MINIMAX_API_KEY,
      baseURL: "https://api.minimaxi.com/v1",
    })
  : null;

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

  const draft = buildHeuristicDraft(data);
  const prompt = buildPrompt(data, draft);

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
      engineLabel: `分析方式：MiniMax 实时分析 (${model})`,
      title: parsed.title || draft.title,
      description: parsed.description || draft.description,
      reasons: ensureList(parsed.reasons, draft.reasons),
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

function buildHeuristicDraft(data) {
  const taskText = `${data.jobTitle} ${data.tasks}`.toLowerCase();
  let score = 45;

  score += data.repeatability * 8;
  score += data.digitization * 6;
  score -= data.creativity * 7;
  score -= data.humanFactor * 6;
  score += industryBias[data.industry] || 0;
  score += experienceBias[data.experience] || 0;

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
    strengths: buildStrengths(data, score),
    actions: buildActions(data, score),
    nextPath: buildNextPath(data, score),
  };
}

function buildPrompt(data, draft) {
  return `
你是一个职业风险分析顾问。请根据用户资料，判断这个岗位被 AI 替代的风险，并输出严格 JSON。

输出要求：
1. 只输出 JSON，不要输出 markdown，不要加解释。
2. 字段必须完整：
{
  "score": 0-100 的整数,
  "level": "高风险" | "中等风险" | "低风险",
  "title": "一句总结标题",
  "description": "2-3 句结果综述",
  "reasons": ["原因1", "原因2", "原因3"],
  "strengths": ["优势1", "优势2", "优势3"],
  "actions": ["建议1", "建议2", "建议3"],
  "nextPath": "一段升级方向建议"
}
3. 结论要具体，避免空话，语气要像面向大众用户的职业分析网页。

用户资料：
${JSON.stringify(data, null, 2)}

你可以参考下面这个启发式初稿，但不要机械重复：
${JSON.stringify(
    {
      score: draft.score,
      level: draft.level.label,
      reasons: draft.reasons,
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
