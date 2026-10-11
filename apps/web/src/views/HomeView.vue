<script setup lang="ts">
import { computed, ref } from "vue";
import { ArrowRight, ArrowUp, ArrowUpRight } from "lucide-vue-next";
import SiteNav from "../components/SiteNav.vue";
import { askFromHome, go, openReader, sources, sourcesLoaded, SUGGESTIONS, TOPICS } from "../state";

const ask = ref("");
const preview = computed(() => sources.value.slice(0, 5));
const organizations = computed(() => [...new Set(sources.value.map((item) => item.organization))]);

function submit(): void {
  askFromHome(ask.value);
}

function onEnter(event: KeyboardEvent): void {
  // Enter that confirms an IME candidate must not submit.
  if (event.isComposing || event.keyCode === 229) return;
  event.preventDefault();
  submit();
}

const ROLES = [
  {
    role: "托育机构负责人",
    title: "办好托育，先把规范弄明白",
    body: "设置标准、管理规范、人员配备、日常制度……需要核对依据时，一问就有答案，还能直接查看政策原文。",
    image: "/images/role-director.jpg",
    alt: "托育机构负责人手持平板站在明亮的走廊里",
    ask: "托育机构设置和管理有哪些基本要求？",
  },
  {
    role: "保育师与教师",
    title: "每天的保育工作，随手可查",
    body: "生活照料、喂养辅食、睡眠、安全观察、家园沟通。遇到拿不准的做法，随时问一句，心里更有底。",
    image: "/images/scene-play.jpg",
    alt: "老师在明亮的活动室里看护正在玩耍的幼儿",
    ask: "托育机构日常保育工作包括哪些内容？",
  },
  {
    role: "家长与照护者",
    title: "在家照护有疑问，也能放心问",
    body: "了解科学照护的要点，看懂托育机构应该怎么做，帮助你做出更安心的选择。",
    image: "/images/role-parent.jpg",
    alt: "妈妈抱着宝宝坐在沙发上用手机查询",
    ask: "7—12个月婴儿添加辅食有哪些照护要点？",
  },
];

const PROMISES = [
  { title: "每条回答都有出处", body: "答复里的关键结论都标有编号，点开就能看到来自哪份资料、第几页，并直接对照原文。" },
  { title: "依据权威资料", body: "以国家卫生健康委员会、国务院办公厅等发布的政策法规与照护指南为准，不凭空作答。" },
  { title: "可以接着追问", body: "像和同事聊天一样，围绕同一个话题一路追问，上下文自动衔接，不必重复说明。" },
  { title: "守住专业边界", body: "不做疾病诊断，不解读检查结果，不给用药建议；资料之外的问题会如实告知，而不是编造答案。" },
];

const STEPS = [
  { title: "说出你的问题", body: "用日常的话描述就行，一句话也可以。" },
  { title: "获得清楚的答复", body: "几秒钟内，得到条理清楚、重点明确的答复。" },
  { title: "点开核对出处", body: "点击编号，对照资料原文，放心采用。" },
];
</script>

<template>
  <div class="page home">
    <SiteNav current="home" />

    <!-- ===== Hero ===== -->
    <section class="hero container">
      <div class="hero-copy">
        <p class="hero-eyebrow rise" style="--d: 0"><span class="seal-dot"></span>0—3岁托育照护知识问答</p>
        <h1 class="hero-title">
          <span class="rise" style="--d: 1">托育照护，</span>
          <span class="rise" style="--d: 2">句句有<em>出处</em>。</span>
        </h1>
        <p class="hero-lede rise" style="--d: 3">把托育与婴幼儿照护的专业知识，变成随手可问的身边顾问。保育、喂养、安全、机构管理，问一句，就有依据清楚的答复。</p>

        <form class="hero-ask rise" style="--d: 4" @submit.prevent="submit">
          <textarea v-model="ask" rows="2" maxlength="3000" placeholder="输入一个托育或婴幼儿照护问题…" aria-label="输入问题" @keydown.enter.exact="onEnter"></textarea>
          <div class="hero-ask-bar">
            <span class="hero-ask-hint">按 Enter 提问</span>
            <button class="hero-send" type="submit" :disabled="!ask.trim()" aria-label="提问"><ArrowUp :size="18" :stroke-width="2.2" /></button>
          </div>
        </form>

        <div class="hero-try rise" style="--d: 5">
          <p>试试这样问</p>
          <ul>
            <li v-for="item in SUGGESTIONS" :key="item.text">
              <button type="button" @click="askFromHome(item.text)"><ArrowUpRight :size="14" />{{ item.text }}</button>
            </li>
          </ul>
        </div>
      </div>

      <div class="hero-visual rise" style="--d: 3">
        <div class="rings" aria-hidden="true"></div>
        <figure class="arch">
          <img src="/images/hero-play.jpg" alt="托育老师蹲在地上，陪一岁多的孩子一起搭积木" width="768" height="1024" />
        </figure>
        <div class="demo" aria-label="回答示例">
          <span class="demo-tag">回答示例</span>
          <p class="demo-q">7—12个月婴儿添加辅食有哪些照护要点？</p>
          <p class="demo-a">及时添加辅食，从富含铁的泥糊状食物开始；每引入一种新食物，要密切观察婴儿是否出现皮疹、呕吐、腹泻等不良反应<sup>1</sup></p>
          <p class="demo-ref"><span class="seal">1</span>托育机构保育指导大纲（试行）<small>营养与喂养</small></p>
        </div>
      </div>
    </section>

    <!-- ===== Trust strip ===== -->
    <div class="container">
      <div class="trust">
        <p class="trust-label">回答依据来自</p>
        <p v-if="organizations.length" class="trust-orgs"><span v-for="org in organizations" :key="org">{{ org }}</span></p>
        <p v-else class="trust-orgs"><span>国家发布的政策法规与照护指南</span></p>
        <p class="trust-count"><b>{{ sources.length || "—" }}</b> 份官方资料，持续更新</p>
      </div>
    </div>

    <!-- ===== Who it is for ===== -->
    <section class="section container">
      <p class="eyebrow">适合谁用</p>
      <h2 class="section-title">无论你在哪个岗位，都能得到靠谱的答复。</h2>
      <ul class="roles">
        <li v-for="item in ROLES" :key="item.role">
          <img :src="item.image" :alt="item.alt" width="1024" height="768" loading="lazy" decoding="async" />
          <p class="role-tag">{{ item.role }}</p>
          <h3>{{ item.title }}</h3>
          <p class="role-body">{{ item.body }}</p>
          <button type="button" @click="askFromHome(item.ask)">试着问：{{ item.ask }}<ArrowUpRight :size="14" /></button>
        </li>
      </ul>
    </section>

    <!-- ===== What you can ask ===== -->
    <section class="topics-band">
      <div class="container topics">
        <figure class="topics-photo">
          <img src="/images/scene-feeding.jpg" alt="照护者用小勺给坐在餐椅上的宝宝喂辅食" width="1024" height="768" loading="lazy" decoding="async" />
        </figure>
        <div class="topics-copy">
          <p class="eyebrow">可以问什么</p>
          <h2 class="section-title">从日常保育到机构管理，常见问题一问即答。</h2>
          <ul class="topic-list">
            <li v-for="item in TOPICS" :key="item.text">
              <button type="button" @click="askFromHome(item.text)">
                <span class="t-tag">{{ item.tag }}</span>
                <span class="t-text">{{ item.text }}</span>
                <ArrowUpRight :size="16" />
              </button>
            </li>
          </ul>
        </div>
      </div>
    </section>

    <!-- ===== Why trust ===== -->
    <section class="section container">
      <p class="eyebrow">为什么可以放心用</p>
      <h2 class="section-title">答得有依据，才敢用。</h2>
      <ol class="promises">
        <li v-for="(item, i) in PROMISES" :key="item.title">
          <span class="p-no">0{{ i + 1 }}</span>
          <div>
            <h3>{{ item.title }}</h3>
            <p>{{ item.body }}</p>
          </div>
        </li>
      </ol>
    </section>

    <!-- ===== How it works ===== -->
    <section class="how">
      <div class="container how-inner">
        <p class="eyebrow">怎么使用</p>
        <h2 class="section-title">三步，把问题变成有依据的答案。</h2>
        <ol class="steps">
          <li v-for="(item, i) in STEPS" :key="item.title">
            <span class="s-no">0{{ i + 1 }}</span>
            <h3>{{ item.title }}</h3>
            <p>{{ item.body }}</p>
          </li>
        </ol>
      </div>
    </section>

    <!-- ===== Library ===== -->
    <section class="section container library">
      <div class="library-copy">
        <p class="eyebrow">资料库</p>
        <h2 class="section-title">回答背后的每一份<br />资料，都能查看原文。</h2>
        <p class="library-lede">答复所依据的政策法规、行业标准与照护指南都收录在资料库中，你可以随时翻阅，自己核对。</p>
        <a class="btn btn-line" href="#/library">浏览全部资料<ArrowRight :size="16" /></a>
      </div>
      <ul class="library-list">
        <template v-if="preview.length">
          <li v-for="source in preview" :key="source.version_id">
            <button type="button" @click="openReader(source)">
              <span class="l-main">
                <strong>{{ source.title }}</strong>
                <small>{{ source.organization }}</small>
              </span>
              <ArrowUpRight :size="16" />
            </button>
          </li>
        </template>
        <li v-else class="library-empty">{{ sourcesLoaded ? "资料库正在整理中，稍后再来看看。" : "正在读取资料…" }}</li>
      </ul>
    </section>

    <!-- ===== CTA ===== -->
    <section class="cta">
      <div class="container cta-inner">
        <h2>有托育照护的问题，<br />现在就问。</h2>
        <p>打开即用，无需下载安装。</p>
        <button class="btn btn-light" type="button" @click="go('chat')">开始提问<ArrowRight :size="16" /></button>
      </div>
    </section>

    <footer class="footer">
      <div class="container footer-inner">
        <div class="footer-brand">
          <img src="/logo.svg" alt="" width="30" height="30" />
          <div><strong>托育知护</strong><span>婴幼儿照护知识问答</span></div>
        </div>
        <p class="footer-note">本服务提供照护知识参考，不提供疾病诊断、检查解读及用药治疗建议。</p>
        <nav class="footer-links" aria-label="页脚导航"><a href="#/">首页</a><a href="#/chat">智能问答</a><a href="#/library">资料库</a></nav>
      </div>
    </footer>
  </div>
</template>

<style scoped>
/* ---------- Hero ---------- */
.hero { position: relative; display: grid; grid-template-columns: minmax(0, 1.05fr) minmax(0, .95fr); align-items: center; gap: clamp(32px, 5vw, 80px); padding-top: clamp(36px, 7vh, 80px); padding-bottom: clamp(48px, 7vh, 80px); }
.hero-eyebrow { display: flex; align-items: center; gap: 10px; color: var(--ink-3); font: 500 12.5px/1.4 var(--sans); letter-spacing: .14em; }
.hero-title { margin-top: 22px; font: 700 clamp(40px, 5.6vw, 70px)/1.2 var(--serif); letter-spacing: .02em; }
.hero-title span { display: block; }
.hero-title em { position: relative; isolation: isolate; font-style: normal; color: var(--seal-ink); }
.hero-title em::after { content: ""; position: absolute; left: -2px; right: -2px; bottom: .06em; z-index: -1; height: .26em; background: var(--mark); border-radius: 2px; opacity: .85; }
.hero-lede { max-width: 30em; margin-top: 26px; color: var(--ink-2); font-size: 17px; line-height: 1.95; text-wrap: pretty; }

.hero-ask { max-width: 600px; margin-top: 34px; background: var(--sheet); border: 1px solid var(--rule); border-radius: 14px; box-shadow: 0 1px 0 #fff inset, 0 24px 48px -26px #2a24127a, 0 2px 6px #2a24120f; transition: border-color .25s, box-shadow .25s; }
.hero-ask:focus-within { border-color: var(--moss-700); box-shadow: 0 1px 0 #fff inset, 0 0 0 4px #27503f1c, 0 24px 48px -26px #2a24127a; }
.hero-ask textarea { display: block; width: 100%; padding: 18px 20px 6px; resize: none; color: var(--ink); background: transparent; border: 0; outline: 0; font-size: 16px; line-height: 1.7; }
.hero-ask textarea::placeholder { color: #8b8672; }
.hero-ask-bar { display: flex; align-items: center; justify-content: space-between; padding: 4px 10px 10px 20px; }
.hero-ask-hint { color: #7d7966; font-size: 12px; }
.hero-send { display: grid; width: 40px; height: 40px; place-items: center; color: #f6f1e6; background: var(--moss-800); border: 0; border-radius: 10px; box-shadow: 0 6px 14px -6px #14291f99; transition: background .2s, transform .2s var(--ease); }
.hero-send:hover:not(:disabled) { background: var(--moss-700); transform: translateY(-1px); }
.hero-send:disabled { color: #a79f88; background: var(--paper-sunk); box-shadow: none; }

.hero-try { max-width: 600px; margin-top: 24px; }
.hero-try p { margin-bottom: 4px; color: var(--ink-3); font-size: 12px; font-weight: 600; letter-spacing: .14em; }
.hero-try button { display: flex; align-items: center; gap: 10px; width: 100%; padding: 7px 0; color: var(--ink-2); text-align: left; background: none; border: 0; font-size: 14px; line-height: 1.5; transition: color .2s, transform .3s var(--ease); }
.hero-try button svg { flex: none; color: #b2a98f; transition: color .2s, transform .3s var(--ease); }
.hero-try button:hover { color: var(--ink); transform: translateX(3px); }
.hero-try button:hover svg { color: var(--seal); transform: translate(2px, -2px); }

/* Hero visual: arch photo + a real sample answer */
.hero-visual { position: relative; width: 100%; max-width: 470px; margin-left: auto; padding-bottom: 56px; }
.rings { position: absolute; inset: -10% -22% 0 -14%; pointer-events: none; background: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='600' height='600' viewBox='0 0 600 600' fill='none' stroke='%2327503f' stroke-opacity='.13'><circle cx='300' cy='300' r='60'/><circle cx='300' cy='300' r='120'/><circle cx='300' cy='300' r='180'/><circle cx='300' cy='300' r='240'/><circle cx='300' cy='300' r='298'/></svg>") center / contain no-repeat; }
.arch { position: relative; margin: 0; overflow: hidden; aspect-ratio: 3 / 3.7; border-radius: 999px 999px 18px 18px; background: var(--paper-sunk); box-shadow: 0 40px 70px -36px #2a2412a6, 0 0 0 1px #2a24121a; }
.arch img { display: block; width: 100%; height: 100%; object-fit: cover; object-position: 50% 30%; }
.demo { position: absolute; left: -44px; bottom: 0; width: min(340px, 82%); padding: 18px 20px 18px; background: var(--sheet); border: 1px solid var(--rule); border-radius: 12px; box-shadow: 0 1px 0 #fff inset, 0 34px 60px -28px #2a2412b3, 0 4px 14px -4px #2a241233; animation: float 9s ease-in-out infinite; }
.demo-tag { position: absolute; top: -10px; right: 16px; padding: 3px 9px; color: #fff; background: var(--moss-800); border-radius: 4px; font-size: 11px; font-weight: 600; letter-spacing: .1em; }
.demo-q { font: 650 14.5px/1.55 var(--serif); }
.demo-a { margin-top: 10px; color: var(--ink-2); font-size: 13.5px; line-height: 1.85; }
.demo-a sup { position: relative; top: -.5em; display: inline-flex; align-items: center; justify-content: center; min-width: 15px; height: 15px; margin-left: 3px; color: #fff; background: var(--seal); border-radius: 2px; font: 600 10.5px/1 var(--mono); transform: rotate(-3deg); vertical-align: baseline; }
.demo-ref { display: flex; align-items: center; flex-wrap: wrap; gap: 4px 9px; margin-top: 13px; padding-top: 12px; border-top: 1px dashed var(--rule); font: 500 12.5px/1.5 var(--serif); }
.demo-ref .seal { width: 18px; height: 18px; font-size: 11px; }
.demo-ref small { color: var(--ink-3); font: 500 11.5px var(--sans); }
@keyframes float { 50% { translate: 0 -8px; } }

/* ---------- Trust strip ---------- */
.trust { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 12px 32px; padding: 22px 0; border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); }
.trust-label { color: var(--ink-3); font-size: 12px; font-weight: 600; letter-spacing: .14em; white-space: nowrap; }
.trust-orgs { display: flex; flex-wrap: wrap; gap: 6px 26px; font: 600 16px/1.5 var(--serif); }
.trust-orgs span { position: relative; }
.trust-orgs span + span::before { content: ""; position: absolute; left: -15px; top: 50%; width: 4px; height: 4px; margin-top: -2px; background: var(--seal); border-radius: 1px; transform: rotate(10deg); }
.trust-count { color: var(--ink-3); font-size: 13px; white-space: nowrap; }
.trust-count b { margin-right: 2px; color: var(--ink); font: 650 20px var(--serif); }

/* ---------- Sections ---------- */
.section { padding-top: clamp(72px, 11vh, 120px); padding-bottom: clamp(24px, 4vh, 40px); }
.section-title { margin-top: 16px; font: 700 clamp(28px, 3.5vw, 42px)/1.4 var(--serif); letter-spacing: .02em; text-wrap: balance; }

.roles { display: grid; grid-template-columns: repeat(3, 1fr); gap: clamp(20px, 3vw, 40px); margin-top: 48px; }
.roles li { display: flex; flex-direction: column; }
.roles img { display: block; width: 100%; height: auto; aspect-ratio: 4 / 3; object-fit: cover; border-radius: 12px; box-shadow: 0 24px 44px -28px #2a2412a6, 0 0 0 1px #2a24121a; }
.role-tag { margin-top: 22px; color: var(--seal-ink); font-size: 12px; font-weight: 650; letter-spacing: .16em; }
.roles h3 { margin-top: 10px; font: 650 22px/1.45 var(--serif); }
.role-body { margin-top: 12px; color: var(--ink-2); font-size: 15px; line-height: 1.95; text-wrap: pretty; }
.roles button { display: inline-flex; align-items: flex-start; gap: 6px; margin-top: auto; padding: 18px 0 0; color: var(--moss-700); text-align: left; background: none; border: 0; font-size: 13.5px; font-weight: 600; line-height: 1.6; }
.roles button svg { flex: none; margin-top: 4px; transition: transform .3s var(--ease); }
.roles button:hover { text-decoration: underline; text-underline-offset: 4px; }
.roles button:hover svg { transform: translate(2px, -2px); }

.topics-band { margin-top: clamp(64px, 10vh, 112px); background: var(--paper-sunk); border-top: 1px solid var(--rule); border-bottom: 1px solid var(--rule); }
.topics { display: grid; grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr); align-items: center; gap: clamp(32px, 6vw, 88px); padding-top: clamp(56px, 9vh, 96px); padding-bottom: clamp(56px, 9vh, 96px); }
.topics-photo { margin: 0; }
.topics-photo img { display: block; width: 100%; height: auto; aspect-ratio: 4 / 4.3; object-fit: cover; object-position: 30% 50%; border-radius: 14px; box-shadow: 0 40px 70px -36px #2a2412a6, 0 0 0 1px #2a24121a; }
.topic-list { margin-top: 30px; border-top: 1px solid #bdb39866; }
.topic-list li { border-bottom: 1px solid #bdb39840; }
.topic-list button { display: grid; grid-template-columns: 76px minmax(0, 1fr) 16px; align-items: center; gap: 14px; width: calc(100% + 24px); margin: 0 -12px; padding: 15px 12px; text-align: left; background: none; border: 0; border-radius: 10px; transition: background .25s; }
.topic-list button:hover { background: #fffdf899; }
.t-tag { color: var(--seal-ink); font-size: 12px; font-weight: 650; letter-spacing: .12em; }
.t-text { font: 500 16px/1.6 var(--serif); }
.topic-list svg { color: #b2a98f; transition: transform .3s var(--ease), color .2s; }
.topic-list button:hover svg { color: var(--seal); transform: translate(2px, -2px); }

.promises { display: grid; grid-template-columns: repeat(2, 1fr); column-gap: clamp(32px, 6vw, 88px); margin-top: 48px; }
.promises li { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 16px; padding: 28px 0 34px; border-top: 1px solid var(--rule); }
.p-no { padding-top: 5px; color: var(--seal); font: 500 14px/1 var(--mono); }
.promises h3 { font: 650 22px/1.4 var(--serif); }
.promises p { margin-top: 12px; color: var(--ink-2); font-size: 15.5px; line-height: 1.95; text-wrap: pretty; }

.how { margin-top: clamp(56px, 9vh, 96px); color: #f6f1e6; background: radial-gradient(90% 120% at 100% 0%, #2c5c4955, transparent 60%), linear-gradient(180deg, var(--moss-900), var(--moss-950)); }
.how-inner { padding-top: clamp(64px, 10vh, 104px); padding-bottom: clamp(64px, 10vh, 104px); }
.how .eyebrow { color: #f6f1e699; }
.steps { display: grid; grid-template-columns: repeat(3, 1fr); gap: clamp(24px, 4vw, 56px); margin-top: 56px; }
.steps li { position: relative; padding-top: 26px; border-top: 1px solid #f6f1e63d; }
.steps li::before { content: ""; position: absolute; top: -4px; left: 0; width: 7px; height: 7px; background: var(--seal); border-radius: 1.5px; transform: rotate(10deg); }
.s-no { display: block; margin-bottom: 18px; color: transparent; font: 700 56px/1 var(--serif); -webkit-text-stroke: 1px #f6f1e68c; }
.steps h3 { font: 650 22px/1.4 var(--serif); }
.steps p { max-width: 17em; margin-top: 12px; color: #f6f1e6b8; font-size: 15px; line-height: 1.95; }

.library { display: grid; grid-template-columns: minmax(0, .85fr) minmax(0, 1.15fr); gap: clamp(32px, 6vw, 88px); align-items: start; }
.library-lede { max-width: 26em; margin: 22px 0 30px; color: var(--ink-2); font-size: 15.5px; line-height: 1.95; }
.library-list { border-top: 1px solid var(--rule); }
.library-list li { border-bottom: 1px solid var(--rule-soft); }
.library-list button { display: flex; align-items: center; gap: 14px; width: calc(100% + 24px); margin: 0 -12px; padding: 18px 12px; text-align: left; background: none; border: 0; border-radius: 10px; transition: background .25s; }
.library-list button:hover { background: #ece5d480; }
.library-list button svg { flex: none; color: #b2a98f; transition: transform .3s var(--ease), color .2s; }
.library-list button:hover svg { color: var(--seal); transform: translate(2px, -2px); }
.l-main { display: grid; flex: 1; gap: 5px; min-width: 0; }
.l-main strong { font: 600 16px/1.5 var(--serif); }
.l-main small { color: var(--ink-3); font-size: 12.5px; }
.library-empty { padding: 28px 0; color: var(--ink-3); font-size: 14px; }

.cta { position: relative; isolation: isolate; overflow: hidden; margin-top: clamp(56px, 9vh, 96px); color: #f6f1e6; background: #0f2018; }
.cta::before { content: ""; position: absolute; z-index: -1; top: 0; right: 0; bottom: 0; width: 62%; background: url("/images/scene-outdoor.jpg") 50% 40% / cover; -webkit-mask-image: linear-gradient(90deg, transparent 0%, #000 55%); mask-image: linear-gradient(90deg, transparent 0%, #000 55%); }
.cta-inner { display: grid; justify-items: start; gap: 18px; padding-top: clamp(80px, 13vh, 132px); padding-bottom: clamp(80px, 13vh, 132px); }
.cta h2 { font: 700 clamp(30px, 4.4vw, 52px)/1.35 var(--serif); letter-spacing: .02em; text-wrap: balance; }
.cta p { color: #f6f1e6c7; font-size: 16px; }
.cta .btn { margin-top: 10px; height: 52px; padding: 0 30px; font-size: 15.5px; }

.footer { color: #f6f1e6b8; background: var(--moss-950); }
.footer-inner { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 24px 40px; padding-top: 36px; padding-bottom: 36px; }
.footer-brand { display: flex; align-items: center; gap: 12px; }
.footer-brand img { border-radius: 8px; }
.footer-brand div { display: grid; gap: 4px; }
.footer-brand strong { color: #f6f1e6; font: 650 17px/1 var(--serif); letter-spacing: .1em; }
.footer-brand span { font-size: 12px; }
.footer-note { font-size: 12.5px; line-height: 1.8; }
.footer-links { display: flex; gap: 22px; font-size: 13px; }
.footer-links a { text-decoration: none; transition: color .2s; }
.footer-links a:hover { color: #fff; }

/* ---------- Responsive ---------- */
@media (max-width: 1020px) {
  .hero { grid-template-columns: minmax(0, 1fr); }
  .hero-visual { max-width: 440px; margin: 20px auto 0; }
  .demo { left: -8px; }
  .trust { grid-template-columns: minmax(0, 1fr); }
  .roles { grid-template-columns: minmax(0, 1fr); max-width: 560px; }
  .topics { grid-template-columns: minmax(0, 1fr); }
  .topics-photo img { aspect-ratio: 4 / 3; }
  .promises { grid-template-columns: minmax(0, 1fr); }
  .library { grid-template-columns: minmax(0, 1fr); }
  .footer-inner { grid-template-columns: minmax(0, 1fr); }
}
@media (max-width: 720px) {
  .steps { grid-template-columns: minmax(0, 1fr); gap: 36px; }
  .hero-lede { font-size: 16px; }
  .topic-list button { grid-template-columns: minmax(0, 1fr) 16px; gap: 4px 12px; }
  .t-tag { grid-column: 1; }
  .t-text { grid-column: 1; }
  .topic-list svg { grid-column: 2; grid-row: 1 / span 2; }
  .demo { left: 0; width: 88%; }
  .cta::before { width: 100%; opacity: .32; -webkit-mask-image: none; mask-image: none; }
}
</style>
