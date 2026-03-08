import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import type { AppSettings } from '../types/chat'
import { DuxAiClient } from '../lib/dux-ai'
import { emptySettings, loadSettings, normalizeSettings, saveSettings } from '../lib/settings-repository'
import { safeErrorMessage } from '../lib/runtime'

export const useSettingsStore = defineStore('settings', () => {
  const settings = ref<AppSettings>(emptySettings())
  const form = ref<AppSettings>(emptySettings())
  const loaded = ref(false)
  const saving = ref(false)
  const testing = ref(false)
  const lastError = ref('')
  const lastTestMessage = ref('')

  const ready = computed(() => loaded.value)
  const configured = computed(() => Boolean(settings.value.serverUrl && settings.value.token))

  async function init() {
    settings.value = await loadSettings()
    form.value = { ...settings.value }
    loaded.value = true
  }

  function updateForm(next: AppSettings) {
    form.value = normalizeSettings(next)
  }

  async function testConnection() {
    testing.value = true
    lastError.value = ''
    lastTestMessage.value = ''

    try {
      const candidate = normalizeSettings(form.value)
      const client = new DuxAiClient({
        getSettings: () => candidate,
      })
      const models = await client.testConnection()
      lastTestMessage.value = models.length ? `连接成功，发现 ${models.length} 个智能体` : '连接成功，但当前没有可用智能体'
      return models
    }
    catch (error) {
      const message = safeErrorMessage(error, '连接测试失败')
      lastError.value = message
      lastTestMessage.value = message
      throw error
    }
    finally {
      testing.value = false
    }
  }

  async function saveForm() {
    saving.value = true
    lastError.value = ''

    try {
      settings.value = await saveSettings(form.value)
      form.value = { ...settings.value }
      lastTestMessage.value = '配置已保存'
      return settings.value
    }
    catch (error) {
      lastError.value = safeErrorMessage(error, '保存配置失败')
      throw error
    }
    finally {
      saving.value = false
    }
  }

  return {
    settings,
    form,
    loaded,
    ready,
    configured,
    saving,
    testing,
    lastError,
    lastTestMessage,
    init,
    updateForm,
    testConnection,
    saveForm,
  }
})
