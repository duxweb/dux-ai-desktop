<script setup lang="ts">
import ChildWindowShell from '../components/ChildWindowShell.vue'
</script>

<template>
  <ChildWindowShell title="关于 Dux AI" description="独立桌面聊天客户端。">
    <div class="space-y-4 text-sm text-[color:var(--app-text-soft)]">
      <div class="rounded-2xl border border-[color:var(--app-border)] bg-[color:color-mix(in_srgb,var(--app-text)_4%,transparent)] px-4 py-3">
        <div class="font-medium text-[color:var(--app-text)]">产品</div>
        <div class="mt-1">Dux AI Desktop</div>
      </div>
      <div class="rounded-2xl border border-[color:var(--app-border)] bg-[color:color-mix(in_srgb,var(--app-text)_4%,transparent)] px-4 py-3">
        <div class="font-medium text-[color:var(--app-text)]">定位</div>
        <div class="mt-1">面向 Dux AI 服务端的桌面聊天客户端，支持原生独立窗口体验。</div>
      </div>
    </div>
  </ChildWindowShell>
</template>
