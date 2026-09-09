/**
 * Interview content engine — 8 core stages (PRD §11.1) with bilingual copy
 * and per-lens focus hints, plus quality-gate rules used by orchestration.
 */
import type { CoreStageId, Language, Lens, QualityLabel } from './constants';
import { CORE_STAGES, MAX_FOLLOWUPS_PER_SESSION, MAX_FOLLOWUPS_PER_STAGE } from './constants';

export interface StageContent {
  stageId: CoreStageId;
  /** index 1..8 shown to the user */
  number: number;
  question: Record<Language, string>;
  guidance: Record<Language, string>;
  whyWeAsk: Record<Language, string>;
  example: Record<Language, string>;
  lensHint: Record<Lens, Record<Language, string>>;
  /** keywords that mark a skipped/empty answer */
  qualityGateDescription: Record<Language, string>;
}

const L = (en: string, zh: string): Record<Language, string> => ({ en, 'zh-CN': zh });

export const STAGE_CONTENT: Record<CoreStageId, StageContent> = {
  Q1: {
    stageId: 'Q1',
    number: 1,
    question: L(
      'What decision do you need to make, by when, and who owns the decision?',
      '你需要作出什么决定？最迟什么时候？谁拥有最终决定权？',
    ),
    guidance: L(
      'Name the one decision that matters most for 2027 — not a list of topics. Include the scope and the deadline.',
      '请说出 2027 年最关键的这一个决定——不是话题清单。请包含范围与时限。',
    ),
    whyWeAsk: L(
      'A strategy needs a decision it exists to inform. Without a decision, owner and deadline, the rest becomes a wish list.',
      '战略是为了支撑某个决定而存在的。没有决定、负责人和时限，其余内容会退化为愿望清单。',
    ),
    example: L(
      'Example: “Whether our 2027 priority is one cross-property customer data platform or property-by-property experience upgrades — decided by the Group CTO by end of October.”',
      '示例：「2027 年优先做统一宾客数据平台，还是各物业分别做体验升级——由集团 CTO 在 10 月底前决定。」',
    ),
    lensHint: {
      technology: L(
        'State the technology or digital decision — for example a platform, an architecture direction or an AI investment.',
        '说明这个技术或数字化决定，例如某个平台、架构方向或 AI 投资。',
      ),
      business: L(
        'State the business-unit decision — market focus, offering, growth bet or operating model change.',
        '说明这个业务决定——市场重心、产品组合、增长赌注或运营模式变化。',
      ),
      leadership: L(
        'State the personal leadership decision — career move, mandate, capability build or portfolio of commitments.',
        '说明这个个人领导力决定——职业选择、权责范围、能力建设或承诺组合。',
      ),
    },
    qualityGateDescription: L(
      'Decision, scope, deadline and owner must exist.',
      '必须存在决定、范围、期限和负责人。',
    ),
  },
  Q2: {
    stageId: 'Q2',
    number: 2,
    question: L(
      'What changed or happened that makes this decision important now? Which parts are facts and which are judgments?',
      '发生了什么变化，让这个决定现在变得重要？其中哪些是事实，哪些只是判断？',
    ),
    guidance: L(
      'Separate what you know (facts) from what you believe (judgments). Keep it short.',
      '把「你知道的」（事实）和「你判断的」（观点）分开。请保持简短。',
    ),
    whyWeAsk: L(
      'Good strategy responds to a real change. Mixing facts with interpretations makes later choices fragile.',
      '好的战略回应真实变化。把事实与解读混在一起，会让后续选择变得脆弱。',
    ),
    example: L(
      'Example: Fact: “Guest journey NPS fell in two properties.” Judgment: “Because the properties built separate tools.”',
      '示例：事实：「两家物业的宾客旅程 NPS 下降。」判断：「因为各物业各自建了工具。」',
    ),
    lensHint: {
      technology: L(
        'Include changes in technology, data, cyber risk, vendors or regulation.',
        '请包括技术、数据、网络安全风险、供应商或监管的变化。',
      ),
      business: L(
        'Include changes in customers, competitors, economics or regulation.',
        '请包括客户、竞争、经济或监管的变化。',
      ),
      leadership: L(
        'Include changes in your role, team, market or personal constraints.',
        '请包括角色、团队、市场或个人约束的变化。',
      ),
    },
    qualityGateDescription: L('Facts and interpretations can be separated.', '事实与解读可以被区分。'),
  },
  Q3: {
    stageId: 'Q3',
    number: 3,
    question: L(
      'By the end of 2027, what observable result would represent meaningful progress?',
      '如果到 2027 年底取得了实质进展，最重要的可观察结果是什么？',
    ),
    guidance: L(
      'Describe an outcome you could observe and measure — not an activity. One headline plus at most two supporting numbers is ideal.',
      '描述一个可以被观察和衡量的结果——而不是一项活动。理想情况是一个总目标加最多两个支撑数字。',
    ),
    whyWeAsk: L(
      '“Launch”, “implement” or “be best in class” describe activity or aspiration. The crux of the matter needs a testable result.',
      '「上线」「实施」「做到一流」描述的是活动或愿望。关键障碍需要一个可检验的结果。',
    ),
    example: L(
      'Example: “By Q4 2027, prioritized guest journeys run on consented cross-property identity, and the two critical operations meet agreed resilience targets.”',
      '示例：「到 2027 年 Q4，优先宾客旅程在经同意的跨物业身份基础上运行，两个关键运营达到约定的韧性目标。」',
    ),
    lensHint: {
      technology: L(
        'Prefer a business result technology enables — value, risk or experience — not the number of systems launched.',
        '优先描述技术所支撑的业务结果——价值、风险或体验——而不是上线了多少系统。',
      ),
      business: L(
        'Prefer revenue, margin, share, retention or cost outcomes you would defend in a review.',
        '优先描述你愿意在评审中为之辩护的收入、毛利、份额、留存或成本结果。',
      ),
      leadership: L(
        'Prefer an outcome about your leadership capacity, team, or network that others can observe.',
        '优先描述关于领导能力、团队或关系网络、且他人可观察的结果。',
      ),
    },
    qualityGateDescription: L(
      'At least one outcome must exist — not only an activity.',
      '必须至少有一个结果——而不只是一项活动。',
    ),
  },
  Q4: {
    stageId: 'Q4',
    number: 4,
    question: L(
      'What mechanism is preventing that result? What other explanation could also be true?',
      '真正阻碍这个结果的机制是什么？还有哪些不同的解释也可能成立？',
    ),
    guidance: L(
      'Name the cause you believe is at work — and at least one alternative explanation with a reason it might also be true.',
      '说出你认为起作用的原因，并至少给出一种替代解释及它为何也可能成立。',
    ),
    whyWeAsk: L(
      'Symptoms are easy to see; mechanisms are not. Requiring a second explanation protects the diagnosis from overconfidence.',
      '症状容易看见，机制不容易。要求第二种解释可以防止诊断过度自信。',
    ),
    example: L(
      'Example: “Fragmented ownership slows us (my view). It could also be that incentives reward local delivery, so people build around the centre.”',
      '示例：「我认为分散的职责归属拖慢了进度。另一种解释是：激励机制奖励本地交付，所以大家绕开中心自建。」',
    ),
    lensHint: {
      technology: L(
        'Consider integration debt, ownership, incentives, skills, vendor lock-in or data quality.',
        '请考虑集成债、职责归属、激励、技能、供应商锁定或数据质量。',
      ),
      business: L(
        'Consider economics, organization, incentives, channel or operating-model causes.',
        '请考虑经济性、组织、激励、渠道或运营模式层面的原因。',
      ),
      leadership: L(
        'Consider capability, time-allocation, network or mindset mechanisms.',
        '请考虑能力、时间分配、关系网络或思维方式层面的机制。',
      ),
    },
    qualityGateDescription: L(
      'At least two candidate diagnoses, or one diagnosis with disconfirming evidence.',
      '至少两个候选诊断，或一个带有反证的诊断。',
    ),
  },
  Q5: {
    stageId: 'Q5',
    number: 5,
    question: L(
      'If resources do not increase, which obstacle deserves priority? What important work will not be addressed now?',
      '如果资源不增加，哪个障碍最值得优先解决？哪些重要事项本轮明确不处理？',
    ),
    guidance: L(
      'Choose one pivotal obstacle and one explicit exclusion. Deliberately not doing something is part of the answer.',
      '选出一个关键障碍和一个明确排除的事项。「刻意不做某事」也是答案的一部分。',
    ),
    whyWeAsk: L(
      'Strategy is resource allocation. If nothing is excluded, the diagnosis has not yet forced a choice.',
      '战略就是资源配置。如果什么都不排除，说明诊断还没有迫使你作出选择。',
    ),
    example: L(
      'Example: “Priority: the shared data foundation. Deliberately not now: property-by-property mobile app rebuilds, which stay at current level.”',
      '示例：「优先：统一数据基础。本轮刻意不做：各物业 App 重建，维持现状。」',
    ),
    lensHint: {
      technology: L(
        'Force a technology trade-off — which capability or platform bet comes first, and which is deferred.',
        '请作出技术取舍——哪个能力或平台赌注先行，哪个延后。',
      ),
      business: L(
        'Force a portfolio trade-off — which segment, product or market is first, which is parked.',
        '请作出组合取舍——哪个细分、产品或市场先行，哪个暂缓。',
      ),
      leadership: L(
        'Force a personal trade-off — which leadership bet comes first and which commitment you drop.',
        '请作出个人取舍——哪个领导力赌注先行，放弃哪项承诺。',
      ),
    },
    qualityGateDescription: L(
      'One pivotal obstacle plus an explicit exclusion.',
      '一个关键障碍加上一个明确的排除项。',
    ),
  },
  Q6: {
    stageId: 'Q6',
    number: 6,
    question: L(
      'What genuinely different response options exist? For each: where will you play, how will you create advantage, and what will you give up?',
      '有哪些真正不同的应对路径？对每条路径说明：在哪里投入、如何创造优势、放弃什么。',
    ),
    guidance: L(
      'Compare at least two options that differ in guiding policy — not in task ordering. Name the trade-off each one accepts.',
      '比较至少两条指导方针不同的路径——不是任务排序的不同。说明每条路径接受的取舍。',
    ),
    whyWeAsk: L(
      'Options that differ only in wording hide the real choice. Where-to-play and how-to-win must be paired.',
      '只在措辞上不同的方案隐藏了真正的选择。「在哪里竞争」和「如何取胜」必须成对出现。',
    ),
    example: L(
      'Example: Option A “central foundation first”; Option B “two journey pilots on a thin shared layer”; Option C “common standards with property autonomy”.',
      '示例：方案 A「先建统一基础」；方案 B「在薄共享层上做两个旅程试点」；方案 C「共同标准下的物业自治」。',
    ),
    lensHint: {
      technology: L(
        'Compare different architectural or investment policies with different risk and value profiles.',
        '比较架构或投资政策不同的方案——它们应有不同的风险与价值结构。',
      ),
      business: L(
        'Compare different value propositions, market plays or business models.',
        '比较不同的价值主张、市场打法或商业模式。',
      ),
      leadership: L(
        'Compare different personal mandates or career strategies with different opportunity costs.',
        '比较不同的个人权责或职业策略——它们应有不同的机会成本。',
      ),
    },
    qualityGateDescription: L(
      'At least two alternatives with explicit trade-offs.',
      '至少两条带明确取舍的备选路径。',
    ),
  },
  Q7: {
    stageId: 'Q7',
    number: 7,
    question: L(
      'What capabilities, economics and assumptions must be true for the preferred option to work?',
      '要让首选方案成立，哪些能力、经济条件和关键假设必须为真？',
    ),
    guidance: L(
      'List the assumptions that, if wrong, would sink the option — and mark their current evidence state.',
      '列出那些一旦出错就会让方案失败的关键假设，并标出它们目前的证据状态。',
    ),
    whyWeAsk: L(
      'Plans hide their assumptions. Exposing them turns later surprises into earlier tests.',
      '计划会隐藏假设。把它们暴露出来，能把后来的意外变成更早的检验。',
    ),
    example: L(
      'Example: “Assume two use cases show value in 90 days (unvalidated). Assume executives accept common data definitions (plausible).”',
      '示例：「假设两个用例在 90 天内能证明价值（未验证）。假设管理层接受统一数据定义（可信但未证实）。」',
    ),
    lensHint: {
      technology: L(
        'Cover capabilities, data, security-review capacity, vendor and operating-cost assumptions.',
        '请覆盖能力、数据、安全评审资源、供应商与运营成本假设。',
      ),
      business: L(
        'Cover market, pricing, delivery-capacity and margin assumptions.',
        '请覆盖市场、定价、交付能力与毛利假设。',
      ),
      leadership: L(
        'Cover time, support, capability and personal-cost assumptions.',
        '请覆盖时间、支持、能力与个人成本假设。',
      ),
    },
    qualityGateDescription: L(
      'Capability gaps and assumptions are explicit.',
      '能力差距与关键假设都被明确列出。',
    ),
  },
  Q8: {
    stageId: 'Q8',
    number: 8,
    question: L(
      'What is the smallest 90-day action or test? What result would make you continue, adjust, pause or stop?',
      '未来 90 天最小的行动或验证是什么？什么结果会让你继续、调整、暂停或停止？',
    ),
    guidance: L(
      'Name the owner, the evidence to collect, the decision threshold and the review date.',
      '请指明负责人、要收集的证据、决定阈值和复盘日期。',
    ),
    whyWeAsk: L(
      'A strategy is only as real as its first committed test. Without a threshold, any result can be spun as success.',
      '战略的真实性取决于第一个被承诺的检验。没有阈值，任何结果都可以被包装成成功。',
    ),
    example: L(
      'Example: “By 31 Dec, the two journey pilots show ≥80% consented identity coverage and two business owners adopt the data standard — otherwise pause the platform commitment.”',
      '示例：「到 12 月 31 日，两个旅程试点达到 ≥80% 的经同意身份覆盖，并有两位业务负责人采用数据标准——否则暂停平台投入。」',
    ),
    lensHint: {
      technology: L(
        'Define the smallest technical-or-business proof with an owner and a kill criterion.',
        '定义最小的技术与业务证明，包含负责人和叫停标准。',
      ),
      business: L(
        'Define the smallest market proof — paying design partners, pilot or test cohort.',
        '定义最小的市场证明——付费设计伙伴、试点或测试组。',
      ),
      leadership: L(
        'Define the smallest personal proof — delegated accounts, decision logs, or a network milestone.',
        '定义最小的个人证明——授权的客户、决策记录或一个关系网络里程碑。',
      ),
    },
    qualityGateDescription: L(
      'Owner, evidence, threshold and review date exist.',
      '负责人、证据、阈值和复盘日期都存在。',
    ),
  },
};

export const CORE_STAGE_ORDER: CoreStageId[] = [...CORE_STAGES];

export interface FollowUpBudget {
  perStage: number;
  perSession: number;
}
export const FOLLOW_UP_BUDGET: FollowUpBudget = {
  perStage: MAX_FOLLOWUPS_PER_STAGE,
  perSession: MAX_FOLLOWUPS_PER_SESSION,
};

export const QUALITY_GATE_LABELS: Record<QualityLabel, Record<Language, string>> = {
  sufficient: L('Sufficient', '充分'),
  vague: L('Vague — needs specifics', '模糊——需要更具体'),
  contradictory: L('Contradictory', '存在矛盾'),
  activity_not_outcome: L('Activity, not outcome', '是活动而非结果'),
  too_many_priorities: L('Too many priorities', '优先级过多'),
  missing_tradeoff: L('Trade-off not stated', '未说明取舍'),
  missing_evidence: L('Missing evidence', '缺少证据'),
  skipped: L('Skipped — recorded as unknown', '已跳过——记为未知'),
};

/** Machine reason for a follow-up (drives tests + logging). */
export const FOLLOWUP_REASON = [
  'missing_owner',
  'unsupported_claim',
  'activity_not_outcome',
  'symptom_as_cause',
  'too_many_priorities',
  'options_are_task_variants',
  'no_evidence_logic',
  'no_decision_threshold',
  'ir_domain_module',
] as const;
export type FollowupReason = (typeof FOLLOWUP_REASON)[number];

/** Industry-specific follow-up library (PRD §11.2) — module questions. */
export interface IndustryModule {
  id: string;
  applies: { lens: Lens; industry: string };
  question: Record<Language, string>;
  whyWeAsk: Record<Language, string>;
}
export const INDUSTRY_MODULES: IndustryModule[] = [
  {
    id: 'IR-GUEST-JOURNEY',
    applies: { lens: 'technology', industry: 'integrated_resort_hospitality' },
    question: L(
      'How should the guest and player journey connect across lodging, dining, entertainment, loyalty and live experience in your preferred option?',
      '在首选方案中，宾客与玩家旅程如何贯通住宿、餐饮、娱乐、忠诚度与现场体验？',
    ),
    whyWeAsk: L(
      'Cross-property journeys are where data and experience value concentrate in Integrated Resort environments.',
      '在综合度假村环境中，跨物业旅程正是数据与体验价值集中的地方。',
    ),
  },
  {
    id: 'IR-DATA-AI-VALUE',
    applies: { lens: 'technology', industry: 'integrated_resort_hospitality' },
    question: L(
      'Which value stream suits AI best in this plan, how would its benefit be quantified, and who owns the business result?',
      '在这个计划里，哪个价值流最适合 AI？收益如何量化？谁对业务结果负责？',
    ),
    whyWeAsk: L(
      'AI investments without a named business owner and quantified benefit tend to stall in review.',
      '没有具名业务负责人与量化收益的 AI 投资，往往会在评审中停滞。',
    ),
  },
  {
    id: 'IR-CYBER-RESILIENCE',
    applies: { lens: 'technology', industry: 'integrated_resort_hospitality' },
    question: L(
      'Which critical operating scenario must not be interrupted, and what recovery target and manual fallback are agreed for it?',
      '哪个关键运营场景最不能中断？为它约定的恢复目标和人工兜底是什么？',
    ),
    whyWeAsk: L(
      'Resilience expectations shape architecture and operating budget more than most features do.',
      '韧性预期对架构与运营预算的影响大于多数功能。',
    ),
  },
  {
    id: 'IR-CORE-MODERNIZATION',
    applies: { lens: 'technology', industry: 'integrated_resort_hospitality' },
    question: L(
      'Which legacy system or integration is limiting speed, cost transparency or experience consistency in the preferred option?',
      '在首选方案中，哪个遗留系统或集成正在限制速度、成本透明度或体验一致性？',
    ),
    whyWeAsk: L(
      'Integration debt is a common hidden cause behind “do everything locally” pressure.',
      '集成债是「什么都想本地做」压力的常见隐藏原因。',
    ),
  },
  {
    id: 'IR-GOVERNANCE',
    applies: { lens: 'technology', industry: 'integrated_resort_hospitality' },
    question: L(
      'Is data ownership, model governance, vendor risk and regulatory accountability explicit for this option — or open?',
      '这个方案的数据主责、模型治理、供应商风险与监管责任是明确的，还是仍悬空？',
    ),
    whyWeAsk: L(
      'Accountability gaps surface late and are expensive; naming them now is part of the choice.',
      '责任缺口往往在后期才暴露且代价高昂；现在就点名是选择的一部分。',
    ),
  },
  {
    id: 'IR-CAPITAL-OPMODEL',
    applies: { lens: 'technology', industry: 'integrated_resort_hospitality' },
    question: L(
      'How does this technology investment affect assets, the commercial strategy and the operating budget at the same time?',
      '这项技术投资如何同时影响资产、商业策略与运营预算？',
    ),
    whyWeAsk: L(
      'Technology choices that ignore the operating model usually fail in the budget committee.',
      '忽视运营模式的技术选择通常会在预算委员会受挫。',
    ),
  },
];
