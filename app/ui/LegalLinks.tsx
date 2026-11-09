'use client';
import { useI18n } from './UIProvider';
export function LegalLinks() {
    const { tr } = useI18n();
    return <p className="legal-links"><a href="/terms">{tr('Terms and Conditions')}</a><a href="/privacy">{tr('Privacy Policy')}</a></p>;
}
