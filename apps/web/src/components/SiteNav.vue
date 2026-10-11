<script setup lang="ts">
import { ArrowRight } from "lucide-vue-next";
import { go, type RouteName } from "../state";

defineProps<{ current: RouteName }>();

const LINKS: { name: RouteName; label: string; href: string }[] = [
  { name: "home", label: "首页", href: "#/" },
  { name: "chat", label: "智能问答", href: "#/chat" },
  { name: "library", label: "资料库", href: "#/library" },
];
</script>

<template>
  <header class="nav">
    <div class="container nav-inner">
      <a class="nav-brand" href="#/" aria-label="托育知护 首页">
        <img src="/logo.svg" alt="" width="34" height="34" />
        <span>托育知护</span>
      </a>
      <nav class="nav-links" aria-label="主导航">
        <a v-for="link in LINKS" :key="link.name" :href="link.href" :class="{ active: link.name === current }" :aria-current="link.name === current ? 'page' : undefined">{{ link.label }}</a>
      </nav>
      <button class="btn btn-primary nav-cta" type="button" @click="go('chat')">开始提问<ArrowRight :size="16" /></button>
    </div>
  </header>
</template>

<style scoped>
.nav { position: sticky; top: 0; z-index: 10; background: #f6f1e6d9; backdrop-filter: blur(14px) saturate(1.2); border-bottom: 1px solid var(--rule-soft); }
.nav-inner { display: flex; align-items: center; gap: 36px; height: 68px; }
.nav-brand { display: flex; align-items: center; gap: 11px; text-decoration: none; }
.nav-brand img { border-radius: 9px; box-shadow: 0 4px 12px -4px #14291f80; }
.nav-brand span { font: 650 19px/1 var(--serif); letter-spacing: .1em; }
.nav-links { display: flex; gap: 6px; margin-right: auto; }
.nav-links a { position: relative; padding: 8px 14px; color: var(--ink-3); border-radius: 8px; font-size: 14px; font-weight: 500; text-decoration: none; transition: color .2s, background .2s; }
.nav-links a:hover { color: var(--ink); background: #1b26220d; }
.nav-links a.active { color: var(--ink); font-weight: 650; }
.nav-links a.active::after { content: ""; position: absolute; left: 14px; right: 14px; bottom: -13px; height: 2px; background: var(--seal); border-radius: 2px; }
.nav-cta { height: 40px; padding: 0 18px; font-size: 13.5px; }

@media (max-width: 640px) {
  .nav-inner { gap: 10px; height: 60px; }
  .nav-brand span { font-size: 17px; }
  .nav-links { gap: 0; }
  .nav-links a { padding: 8px 9px; font-size: 13px; }
  .nav-links a.active::after { left: 9px; right: 9px; bottom: -9px; }
  .nav-links a:first-child { display: none; }
  .nav-cta { display: none; }
}
</style>
