<script setup lang="ts">
import { computed, ref } from "vue";
import { ArrowRight, ChevronRight, Search } from "lucide-vue-next";
import SiteNav from "../components/SiteNav.vue";
import { go, openReader, sources, sourcesLoaded } from "../state";
import { statusLabel, statusTone } from "../utils";

const query = ref("");

const filtered = computed(() => {
  const keyword = query.value.trim().toLowerCase();
  if (!keyword) return sources.value;
  return sources.value.filter((item) => `${item.title} ${item.organization} ${item.document_no ?? ""}`.toLowerCase().includes(keyword));
});

function formatDate(value: string | null): string {
  if (!value) return "—";
  return value.slice(0, 10);
}
</script>

<template>
  <div class="page library-page">
    <SiteNav current="library" />

    <main class="container wrap">
      <header class="head">
        <p class="eyebrow rise" style="--d: 0"><span class="seal-dot"></span>资料库</p>
        <h1 class="rise" style="--d: 1">可追溯的资料来源</h1>
        <p class="lede rise" style="--d: 2">回答所引用的政策法规、行业标准与照护指南都收录在这里。点开任意一份，可逐页核对原文、发布机构与效力状态。</p>
      </header>

      <div class="toolbar rise" style="--d: 3">
        <label class="search"><Search :size="16" /><input v-model="query" type="search" placeholder="搜索资料名称、发布机构或文号" aria-label="搜索资料" /></label>
        <span class="count">共 <b>{{ filtered.length }}</b> 份<template v-if="query.trim() && filtered.length !== sources.length"> / {{ sources.length }}</template></span>
      </div>

      <div v-if="filtered.length" class="table rise" style="--d: 4" role="table" aria-label="资料列表">
        <div class="row row-head" role="row">
          <span role="columnheader">资料名称</span>
          <span role="columnheader">发布机构</span>
          <span role="columnheader">效力</span>
          <span role="columnheader">页数</span>
          <span></span>
        </div>
        <button v-for="source in filtered" :key="source.version_id" class="row row-item" type="button" role="row" @click="openReader(source)">
          <span class="c-title" role="cell">
            <strong>{{ source.title }}</strong>
            <small><template v-if="source.document_no">{{ source.document_no }} · </template>发布 {{ formatDate(source.published_at) }}</small>
          </span>
          <span class="c-org" role="cell">{{ source.organization }}</span>
          <span role="cell"><span class="chip" :class="statusTone(source.legal_status)">{{ statusLabel(source.legal_status) }}</span></span>
          <span class="c-pages" role="cell">{{ source.page_count || "—" }}</span>
          <ChevronRight class="c-arrow" :size="16" />
        </button>
      </div>

      <div v-else class="empty">
        <h2>{{ !sourcesLoaded ? "正在读取资料…" : sources.length ? "没有匹配的资料" : "资料库正在整理中" }}</h2>
        <p>{{ !sourcesLoaded ? "请稍候。" : sources.length ? "换个关键词试试。" : "稍后再来看看，或直接去提问。" }}</p>
      </div>

      <div class="next">
        <p>找不到想看的内容？直接问问看。</p>
        <button class="btn btn-primary" type="button" @click="go('chat')">去提问<ArrowRight :size="16" /></button>
      </div>
    </main>
  </div>
</template>

<style scoped>
.wrap { padding-top: clamp(40px, 8vh, 80px); padding-bottom: 96px; }
.head { max-width: 720px; }
.eyebrow { display: flex; align-items: center; gap: 10px; }
h1 { margin-top: 18px; font: 700 clamp(34px, 4.6vw, 52px)/1.25 var(--serif); letter-spacing: .02em; }
.lede { max-width: 34em; margin-top: 20px; color: var(--ink-2); font-size: 16.5px; line-height: 1.95; text-wrap: pretty; }

.toolbar { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-top: 44px; padding-bottom: 16px; border-bottom: 1px solid var(--ink-3); }
.search { display: flex; align-items: center; gap: 10px; width: min(440px, 100%); height: 44px; padding: 0 14px; color: var(--ink-3); background: var(--sheet); border: 1px solid var(--rule); border-radius: 10px; transition: border-color .2s, box-shadow .2s; }
.search:focus-within { border-color: var(--moss-700); box-shadow: 0 0 0 3px #27503f1a; }
.search input { flex: 1; min-width: 0; color: var(--ink); background: none; border: 0; outline: 0; font-size: 14px; }
.search input::placeholder { color: #8b8672; }
.count { flex: none; color: var(--ink-3); font-size: 13px; }
.count b { color: var(--ink); font: 600 15px var(--mono); }

.row { display: grid; grid-template-columns: minmax(0, 2.4fr) minmax(0, 1.3fr) 96px 56px 20px; align-items: center; gap: 20px; width: 100%; padding: 0 12px; text-align: left; }
.row-head { height: 42px; color: var(--ink-3); font-size: 12px; letter-spacing: .1em; border-bottom: 1px solid var(--rule); }
.row-item { min-height: 82px; padding-top: 16px; padding-bottom: 16px; background: none; border: 0; border-bottom: 1px solid var(--rule-soft); transition: background .25s; }
.row-item:hover { background: #ece5d480; }
.c-title { display: grid; gap: 6px; min-width: 0; }
.c-title strong { font: 600 16.5px/1.5 var(--serif); }
.c-title small { color: var(--ink-3); font: 500 12px/1.5 var(--mono); }
.c-org { color: var(--ink-2); font-size: 13.5px; line-height: 1.6; }
.c-pages { color: var(--ink-2); font: 500 13px var(--mono); }
.c-arrow { color: #b2a98f; transition: transform .3s var(--ease), color .2s; }
.row-item:hover .c-arrow { color: var(--seal); transform: translateX(3px); }

.empty { display: grid; justify-items: center; gap: 10px; padding: 72px 0; text-align: center; }
.empty h2 { font: 650 20px/1.4 var(--serif); }
.empty p { color: var(--ink-3); font-size: 14px; }

.next { display: flex; align-items: center; justify-content: space-between; gap: 20px; margin-top: 56px; padding: 26px 28px; background: var(--paper-sunk); border-radius: 12px; }
.next p { font: 600 18px/1.5 var(--serif); }

@media (max-width: 820px) {
  .row { grid-template-columns: minmax(0, 1fr) 20px; gap: 6px 12px; }
  .row-head { display: none; }
  .c-org, .c-pages { display: none; }
  .row-item > span:nth-child(3) { grid-column: 1; grid-row: 2; }
  .c-arrow { grid-column: 2; grid-row: 1 / span 2; }
  .next { flex-direction: column; align-items: flex-start; }
}
</style>
