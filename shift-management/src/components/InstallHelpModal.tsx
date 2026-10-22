import { useI18n } from '../i18n/I18nContext'
import { Modal } from './Modal'

/**
 * Cách cài trên iPhone / iPad. Safari không cho trang tự mở hộp cài như
 * Chrome, nên chỉ hướng dẫn được.
 */
export function InstallHelpModal({ onClose }: { onClose: () => void }) {
  const { t } = useI18n()
  return (
    <Modal title={t('pwa.iosTitle')} width="max-w-md" onClose={onClose}>
      <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-700 select-text">
        <li>{t('pwa.iosStep1')}</li>
        <li>{t('pwa.iosStep2')}</li>
        <li>{t('pwa.iosStep3')}</li>
      </ol>
      <p className="mt-4 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600 select-text">
        {t('pwa.iosNote')}
      </p>
    </Modal>
  )
}
