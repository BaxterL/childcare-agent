<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { ChevronLeft, ChevronRight, ExternalLink, X } from "lucide-vue-next";
import { closeReader, flipReaderPage, openReader, pageCountOf, reader } from "../state";
import { locateExcerpt, statusLabel, statusTone } from "../utils";
import type { SourceRef } from "../types";

const status = computed(() => {
  const source = reader.source;
  if (!source) return "";
  return "legalStatus" in source ? source.legalStatus : source.legal_status;
});
const docNo = computed(() => {
  const source = reader.source;
  if (!source) return "";
  return ("documentNo" in source ? source.documentNo : source.document_no) ?? "";
});
const url = computed(() => {
  const source = reader.source;
  if (!source) return "";
  return ("sourceUrl" in source ? source.sourceUrl : source.source_url) ?? "";
});
const pageCount = computed(() => pageCountOf(reader.source));
const currentIndex = computed(() => {
  const source = reader.source;
  if (!source || !("chunkId" in source)) return -1;
  return reader.siblings.findIndex((item) => item.chunkId === source.chunkId);
});

/** Splits the page so the passage the answer relied on is highlighted. */
const segments = computed(() => {
  const text = reader.text;
  const source = reader.source;
  const plain = [{ text, hit: false }];
  if (!text || reader.loading || !source || !("excerpt" in source) || reader.page !== source.pageNumber) return plain;
  const span = locateExcerpt(text, source.excerpt);
  if (!span) return plain;
  return [
    { text: text.slice(0, span[0]), hit: false },
    { text: text.slice(span[0], span[1]), hit: true },
    { text: text.slice(span[1]), hit: false },
  ].filter((part) => part.text);
});

const bodyEl = ref<HTMLElement | null>(null);

/** Brings the cited passage into view, so readers never have to hunt for it on a long page. */
watch(
  () => [reader.open, reader.loading, reader.page, reader.source] as const,
  async ([open, loading]) => {
    if (!open || loading) return;
    await nextTick();
    const body = bodyEl.value;
    if (!body) return;
    const mark = body.querySelector("mark");
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const top = mark ? Math.max(0, mark.getBoundingClientRect().top - body.getBoundingClientRect().top + body.scrollTop - 140) : 0;
    body.scrollTo({ top, behavior: calm ? "auto" : "smooth" });
  },
  { flush: "post" },
);

function jump(delta: number): void {
  const list = reader.siblings;
  if (list.length < 2) return;
  const next = list[(currentIndex.value + delta + list.length) % list.length];
  if (next) void openReader(next, list);
}

function pick(source: SourceRef): void {
  void openReader(source, reader.siblings);
}
</script>

<template>
  <Transition name="fade">
    <div v-if="reader.open" class="scrim" @click="closeReader"></div>
  </Transition>
  <Transition name="slide">
    <aside v-if="reader.open && reader.source" class="drawer" role="dialog" aria-modal="true" aria-label="资料原文">
      <header class="drawer-head">
        <span class="eyebrow">资料原文</span>
        <div v-if="reader.siblings.length > 1" class="switcher">
          <button type="button" aria-label="上一条引用" @click="jump(-1)"><ChevronLeft :size="15" /></button>
          <span><b>{{ currentIndex + 1 }}</b> / {{ reader.siblings.length }}</span>
          <button type="button" aria-label="下一条引用" @click="jump(1)"><ChevronRight :size="15" /></button>
        </div>
        <button class="icon-btn close" type="button" aria-label="关闭" @click="closeReader"><X :size="18" /></button>
      </header>

      <div ref="bodyEl" class="drawer-body">
        <div v-if="reader.siblings.length > 1" class="seals" role="tablist" aria-label="本条回答的引用">
          <button
            v-for="item in reader.siblings"
            :key="item.chunkId"
            type="button"
            role="tab"
            class="seal"
            :class="{ on: currentIndex >= 0 && reader.siblings[currentIndex]?.chunkId === item.chunkId }"
            :aria-selected="currentIndex >= 0 && reader.siblings[currentIndex]?.chunkId === item.chunkId"
            :title="item.title"
            @click="pick(item)"
          >{{ item.index }}</button>
        </div>

        <span class="chip" :class="statusTone(status)">{{ statusLabel(status) }}</span>
        <h2 class="doc-title">{{ reader.source.title }}</h2>
        <p class="doc-meta">{{ reader.source.organization }}<template v-if="docNo"> · {{ docNo }}</template></p>

        <div class="pager">
          <button type="button" aria-label="上一页" :disabled="reader.page <= 1 || reader.loading" @click="flipReaderPage(-1)"><ChevronLeft :size="16" /></button>
          <span>第 <b>{{ reader.page }}</b><template v-if="pageCount"> / {{ pageCount }}</template> 页</span>
          <button type="button" aria-label="下一页" :disabled="(pageCount > 0 && reader.page >= pageCount) || reader.loading" @click="flipReaderPage(1)"><ChevronRight :size="16" /></button>
        </div>

        <div class="sheet" :aria-busy="reader.loading">
          <div v-if="reader.loading" class="skeleton" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
          <p v-else class="sheet-text"><template v-for="(part, i) in segments" :key="i"><mark v-if="part.hit">{{ part.text }}</mark><template v-else>{{ part.text }}</template></template></p>
        </div>

        <a v-if="url" class="source-link" :href="url" target="_blank" rel="noreferrer">打开发布页面<ExternalLink :size="13" /></a>
      </div>
    </aside>
  </Transition>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; z-index: 40; background: #0f20188c; backdrop-filter: blur(2px); }
.drawer { position: fixed; z-index: 41; top: 0; right: 0; bottom: 0; display: flex; flex-direction: column; width: min(520px, 100vw); background: var(--paper-raised); border-left: 1px solid var(--rule); box-shadow: -30px 0 70px -24px #0f201890; }
.drawer-head { display: flex; align-items: center; gap: 14px; min-height: 64px; padding: 0 16px 0 28px; border-bottom: 1px solid var(--rule); }
.drawer-head .eyebrow { margin-right: auto; }
.switcher { display: inline-flex; align-items: center; gap: 4px; padding: 3px; color: var(--ink-2); background: var(--paper-sunk); border-radius: 9px; font-size: 12.5px; }
.switcher span { min-width: 54px; text-align: center; }
.switcher b { font: 600 13px var(--mono); }
.switcher button { display: grid; width: 28px; height: 28px; place-items: center; color: var(--ink-2); background: var(--sheet); border: 0; border-radius: 6px; box-shadow: 0 1px 2px #2a24121a; transition: transform .2s var(--ease); }
.switcher button:hover { transform: translateY(-1px); }
.drawer-body { flex: 1; min-height: 0; padding: 24px 28px 36px; overflow-y: auto; overscroll-behavior: contain; }

.seals { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 22px; }
.seals .seal { width: 28px; height: 28px; font-size: 13px; color: var(--seal-ink); background: var(--sheet); border: 1px solid #e6bfb0; box-shadow: none; transform: none; cursor: pointer; transition: background .2s, color .2s, transform .25s var(--ease); }
.seals .seal:hover { transform: translateY(-1px); }
.seals .seal.on { color: #fff; background: var(--seal); border-color: var(--seal); transform: rotate(-4deg); }

.doc-title { margin-top: 12px; font: 700 22px/1.5 var(--serif); letter-spacing: .01em; text-wrap: balance; }
.doc-meta { margin-top: 8px; color: var(--ink-3); font-size: 13px; line-height: 1.7; }
.pager { display: flex; align-items: center; justify-content: space-between; margin-top: 22px; padding: 5px; color: var(--ink-2); background: var(--paper-sunk); border-radius: 9px; font-size: 13px; }
.pager b { font: 600 14px var(--mono); }
.pager button { display: grid; width: 32px; height: 32px; place-items: center; color: var(--ink-2); background: var(--sheet); border: 0; border-radius: 6px; box-shadow: 0 1px 2px #2a24121a; transition: transform .2s var(--ease); }
.pager button:hover:not(:disabled) { transform: translateY(-1px); }
.pager button:disabled { opacity: .35; box-shadow: none; }
.sheet { min-height: 240px; margin-top: 14px; padding: 26px 24px 30px; background: var(--sheet); border: 1px solid var(--rule); border-radius: 4px; box-shadow: 0 1px 0 #fff inset, 0 16px 34px -22px #2a241266; }
.sheet-text { color: var(--ink); font: 14.5px/2.1 var(--serif); white-space: pre-wrap; overflow-wrap: anywhere; }
.sheet-text mark { padding: .1em 0; color: inherit; background: var(--mark); box-decoration-break: clone; -webkit-box-decoration-break: clone; }
.source-link { display: inline-flex; align-items: center; gap: 6px; margin-top: 18px; color: var(--moss-700); font-size: 13px; font-weight: 600; text-decoration: none; }
.source-link:hover { text-decoration: underline; text-underline-offset: 3px; }

.fade-enter-active, .fade-leave-active { transition: opacity .3s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
.slide-enter-active, .slide-leave-active { transition: transform .45s var(--ease); }
.slide-enter-from, .slide-leave-to { transform: translateX(102%); }

@media (max-width: 560px) {
  .drawer-head { padding-left: 18px; }
  .drawer-body { padding: 20px 18px 32px; }
}
</style>
