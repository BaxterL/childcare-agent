import type { Evidence } from "./retrieval.js";

interface PreparedEntry {
  id: string;
  aliases: string[];
  titleIncludes: string;
  /** 命中的知识块正文或章节需包含这段，避免答到别的文件。 */
  anchor: string;
  answer: string;
}

/**
 * 高频问题的预制答复。措辞只复述已入库资料里能核对到的句子，
 * 检索不到对应资料时不使用，改走普通问答。
 */
const ENTRIES: PreparedEntry[] = [
  {
    id: "sleep-habit",
    aliases: ["午睡怎么安排", "睡眠怎么照顾", "怎么培养睡眠习惯", "睡眠保育要点"],
    titleIncludes: "保育指导大纲",
    anchor: "睡眠",
    answer:
      "按月龄安排睡眠，目标是获得充足睡眠，并尽量养成独自入睡和比较固定的作息。7—12 个月要识别困倦信号，用常规睡前活动过渡；帮助婴儿仰卧或侧卧入睡，脸和头不要被遮盖，并减少抱睡、摇睡。13—24 个月固定睡眠和唤醒时间，睡前先进入较安静的状态。[1]",
  },
  {
    id: "filing",
    aliases: ["托育机构怎么备案", "备案要交什么材料", "备案需要哪些材料"],
    titleIncludes: "管理规范",
    anchor: "第四条",
    answer:
      "托育机构登记后，应当向所在地县级以上卫生健康部门备案。需要提交评价为“合格”的《托幼机构卫生评价报告》、消防安全检查合格证明、场地证明、工作人员资格证明，并填写备案书和承诺书。提供餐饮服务的，还要提交《食品经营许可证》。变更备案事项的，向原备案部门办理。[1]",
  },
  {
    id: "sick-stay",
    aliases: ["生病了还能留在托育机构吗", "患病期间能不能在园", "生病了能不能继续入托"],
    titleIncludes: "管理规范",
    anchor: "第二十六条",
    answer:
      "婴幼儿患病期间应当在医院接受治疗，或在家护理。机构要做好晨午检和全日健康观察，发现身体、精神或行为异常时，及时通知监护人。[1]",
  },
  {
    id: "staff-roles",
    aliases: ["托育机构要配哪些人", "保育人员是做什么的", "人员怎么配置"],
    titleIncludes: "管理规范",
    anchor: "第十八条",
    answer:
      "机构根据场地合理确定收托规模，并配置综合管理、保育照护、卫生保健、安全保卫等工作人员。负责人负责全面工作；保育人员主要负责日常生活照料、游戏活动，以及促进身心健康和良好行为习惯，并应具备照护经验或相关专业背景，受过婴幼儿保育和心理健康知识培训。[1]",
  },
];

function compact(text: string): string {
  return text.replace(/[\s?？。，,！!、]/g, "");
}

export function matchPrepared(question: string): PreparedEntry | null {
  const normalized = compact(question);
  if (normalized.length < 6) return null;
  return ENTRIES.find((entry) => entry.aliases.some((alias) => normalized.includes(compact(alias)))) ?? null;
}

/** 把预制答复绑到真实检索结果上。对不上资料时返回 null，交给模型。 */
export function composePrepared(question: string, hits: Evidence[]): { hits: Evidence[]; answer: string } | null {
  const entry = matchPrepared(question);
  if (!entry) return null;
  const index = hits.findIndex((hit) =>
    hit.title.includes(entry.titleIncludes) && (hit.text.includes(entry.anchor) || hit.section.includes(entry.anchor)),
  );
  if (index < 0) return null;
  const picked = hits[index]!;
  const ordered = [picked, ...hits.filter((_, item) => item !== index)].map((hit, item) => ({ ...hit, index: item + 1 }));
  return { hits: ordered, answer: entry.answer };
}
