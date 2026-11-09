import type { Metadata } from 'next';
import { LegalPage, Section } from '../legal-layout';
import { contactLine, lawLine, legal } from '../../lib/legal';
export const metadata: Metadata = { title: 'Terms and Conditions | TWMG' };
export default function Terms() {
    return <LegalPage title="Terms and Conditions">
        <Section title="1. Acceptance of these terms"><p>{legal.service} is a free personal finance record-keeping service operated as an independent project by {legal.operator}. By creating an account or using the website or Android app, you agree to these terms. If you do not agree, please do not use the service.</p></Section>
        <Section title="2. What the service is"><p>TWMG helps you keep your own records of accounts, transactions, cards, debts, shared expenses, recurring bills, budgets, loans and Pay Later plans. It does not connect to your bank, move money, make payments, lend money or collect debts. It does not provide financial, tax, legal or investment advice.</p></Section>
        <Section title="3. Your account"><p>You must give a valid email address and be legally able to accept these terms where you live. You are responsible for what happens under your account and for keeping your details up to date.</p></Section>
        <Section title="4. Account security"><p>Use a strong password that you do not use elsewhere, and keep it, your passkeys and your device secure. Tell us promptly if you believe someone else has accessed your account. Never enter full bank account or card numbers; TWMG only needs the last digits.</p></Section>
        <Section title="5. Accuracy of financial data"><p>Everything in TWMG comes from what you enter. Balances, reports and reminders are calculated from those entries, so they are only as accurate as the entries are. Loan and Pay Later balances are the amount you enter less the payments you record; interest is not calculated for you. Always check figures against statements from your bank or lender before relying on them.</p></Section>
        <Section title="6. Your responsibilities"><p>Use the service lawfully and only for your own records. Do not try to access another person&apos;s data, interfere with or overload the service, probe it for weaknesses without permission, or use it to store unlawful content.</p></Section>
        <Section title="7. Payment and transaction records"><p>Records in TWMG are your personal notes and are not proof of payment, receipts, or official statements. Recorded loan and Pay Later payments cannot be edited or deleted individually; a mistake is corrected by reversing the entry, so the history stays complete. A change history of your records is kept to help you find mistakes.</p></Section>
        <Section title="8. PDF reports and exports"><p>Reports, statements and exports are created on your device from your records, and are for your personal use. They are not issued or certified by a bank, lender or authority. Once you download or share a file, you are responsible for keeping it safe.</p></Section>
        <Section title="9. Service availability"><p>TWMG is free and provided on a best-effort basis. It may be interrupted, changed or discontinued, and it may contain errors. Keep your own copy of anything important by using the export options.</p></Section>
        <Section title="10. Limitation of liability"><p>To the extent the law allows, the service is provided &quot;as is&quot; without warranties, and the operator is not liable for indirect or consequential loss, or for losses from relying on figures, reminders or reports in the service. Nothing in these terms limits rights that cannot be limited under the law that applies to you.</p></Section>
        <Section title="11. Suspension and termination"><p>You can delete your account at any time from Account &amp; sign-in. Access may be suspended or ended if these terms are seriously or repeatedly broken, or to protect the service or other users.</p></Section>
        <Section title="12. Changes"><p>The service and these terms may change. The date at the top shows the latest version. If you continue using TWMG after a change takes effect, the updated terms apply.</p></Section>
        <Section title="13. Governing law and jurisdiction"><p>{lawLine()}</p></Section>
        <Section title="14. Contact"><p>Questions about these terms: {contactLine()}</p></Section>
    </LegalPage>;
}
