<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";
import SourceDrawer from "./components/SourceDrawer.vue";
import ChatView from "./views/ChatView.vue";
import HomeView from "./views/HomeView.vue";
import LibraryView from "./views/LibraryView.vue";
import { closeReader, loadSources, refreshStatus, route } from "./state";

const views = { home: HomeView, chat: ChatView, library: LibraryView };
const current = computed(() => views[route.value]);
let timer = 0;

onMounted(() => {
  void refreshStatus();
  void loadSources();
  timer = window.setInterval(() => void refreshStatus(), 20000);
  window.addEventListener("keydown", onKey);
});

onBeforeUnmount(() => {
  window.clearInterval(timer);
  window.removeEventListener("keydown", onKey);
});

function onKey(event: KeyboardEvent): void {
  if (event.key === "Escape") closeReader();
}
</script>

<template>
  <!-- Keep the chat alive so an in-flight answer and scroll position survive page switches. -->
  <KeepAlive include="ChatView">
    <component :is="current" />
  </KeepAlive>
  <SourceDrawer />
</template>
