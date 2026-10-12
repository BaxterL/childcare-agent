<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";
import ChatView from "./views/ChatView.vue";
import HomeView from "./views/HomeView.vue";
import LibraryView from "./views/LibraryView.vue";
import { loadSources, refreshStatus, route } from "./state";

const views = { home: HomeView, chat: ChatView, library: LibraryView };
const current = computed(() => views[route.value]);
let timer = 0;

onMounted(() => {
  void refreshStatus();
  void loadSources();
  timer = window.setInterval(() => void refreshStatus(), 20000);
});

onBeforeUnmount(() => {
  window.clearInterval(timer);
});
</script>

<template>
  <!-- Keep the chat alive so an in-flight answer and scroll position survive page switches. -->
  <KeepAlive include="ChatView">
    <component :is="current" />
  </KeepAlive>
</template>
