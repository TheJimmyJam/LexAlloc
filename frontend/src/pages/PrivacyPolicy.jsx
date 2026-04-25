import { Link } from 'react-router-dom'

const EFFECTIVE_DATE = 'April 25, 2026'
const CONTACT_EMAIL = 'legal@lexalloc.com'

function Section({ title, children }) {
  return (
    <section className="mb-10">
      <h2 className="text-xl font-bold text-slate-900 mb-4 pb-2 border-b border-slate-200">{title}</h2>
      {children}
    </section>
  )
}

function SubSection({ title, children }) {
  return (
    <div className="mb-5">
      <h3 className="text-base font-semibold text-slate-800 mb-2">{title}</h3>
      {children}
    </div>
  )
}

function P({ children }) {
  return <p className="text-slate-600 text-sm leading-relaxed mb-3">{children}</p>
}

function Ul({ items }) {
  return (
    <ul className="list-disc list-inside space-y-1.5 mb-3 text-slate-600 text-sm">
      {items.map((item, i) => <li key={i}>{item}</li>)}
    </ul>
  )
}

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-slate-900 px-6 py-10">
        <div className="max-w-3xl mx-auto">
          <Link to="/" className="text-slate-400 hover:text-white text-sm transition-colors mb-6 inline-block">← Back to LexAlloc</Link>
          <h1 className="text-3xl font-bold text-white">Privacy Policy</h1>
          <p className="text-slate-400 mt-2 text-sm">Effective Date: {EFFECTIVE_DATE}</p>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-3xl mx-auto px-6 py-12">

        {/* Core commitment banner */}
        <div className="bg-brand-50 border border-brand-200 rounded-xl p-5 mb-10">
          <p className="text-brand-800 font-semibold text-sm mb-1">Our Core Commitment</p>
          <p className="text-brand-700 text-sm leading-relaxed">
            We will <strong>never</strong> sell, rent, share, or otherwise transfer your personal information or your clients' data to any third party for any commercial, marketing, or non-service purpose. Your data exists in LexAlloc for one reason: to deliver the LexAlloc service to you. Nothing else.
          </p>
        </div>

        <P>
          LexAlloc ("we," "our," or "us") is a legal invoice apportionment platform built for legal and insurance professionals. We handle sensitive data — including legal invoices, insurance policy information, and account credentials. This Privacy Policy explains exactly what data we collect, why we collect it, and the strict limits on how it is used.
        </P>

        <Section title="1. Data We Collect">
          <SubSection title="1.1 Account Information">
            <P>When you register for LexAlloc, we collect:</P>
            <Ul items={[
              'Email address',
              'Name and organization name',
              'Password (stored as a one-way cryptographic hash — we cannot read it)',
              'Role and access level within your organization',
            ]} />
          </SubSection>
          <SubSection title="1.2 Matter and Invoice Data">
            <P>To deliver the apportionment service, we store:</P>
            <Ul items={[
              'Legal invoice documents (PDFs and extracted text)',
              'Invoice amounts, dates, and service periods',
              'Party names and their assigned share percentages',
              'Insurer names and policy period dates',
              'Apportionment calculations and results',
              'Matter names, descriptions, and associated metadata',
            ]} />
          </SubSection>
          <SubSection title="1.3 Technical and Usage Data">
            <P>We collect limited technical data to operate and secure the platform:</P>
            <Ul items={[
              'IP address and browser/device type (for security and fraud prevention)',
              'Log data including pages visited, actions taken, and timestamps',
              'Error reports to diagnose and fix bugs',
            ]} />
            <P>We do not use cookies for advertising or third-party tracking. Session cookies are used only to keep you logged in.</P>
          </SubSection>
        </Section>

        <Section title="2. How We Use Your Data">
          <P>We use your data for the following purposes only:</P>
          <Ul items={[
            'Authenticating your identity and securing your account',
            'Processing, parsing, and storing invoices you upload',
            'Performing apportionment calculations on your behalf',
            'Sending transactional emails you have requested',
            'Providing customer support when you contact us',
            'Maintaining platform security and preventing unauthorized access',
            'Diagnosing bugs and improving platform performance',
          ]} />
          <P>We will not use your data for any other purpose without your explicit prior written consent.</P>
        </Section>

        <Section title="3. What We Will Never Do">
          <P>We make the following absolute commitments:</P>
          <Ul items={[
            'We will NEVER sell your data to any third party',
            'We will NEVER share your data with advertisers or data brokers',
            'We will NEVER use your invoice or matter data to train AI/ML models for sale or license to third parties',
            'We will NEVER send marketing communications to your clients based on data you upload',
            'We will NEVER combine your data with data from other sources for profiling sold to others',
            'We will NEVER disclose your data to any government authority without a valid legal order, and will notify you promptly to the extent permitted by law',
          ]} />
        </Section>

        <Section title="4. Third-Party Service Providers">
          <P>LexAlloc operates on a small set of trusted infrastructure providers. We share only the minimum data necessary for them to deliver their specific technical function:</P>
          <Ul items={[
            'Supabase — secure database and file storage',
            'Railway — backend compute hosting',
            'Netlify — frontend hosting',
            'Resend — transactional email delivery (email address only)',
            'OpenAI — PDF invoice parsing (invoice text only; OpenAI\'s API terms prohibit training on API inputs)',
            'Cloudflare — DNS, CDN, and DDoS protection',
          ]} />
          <P>Each provider is contractually bound to use your data solely for the technical services they provide to us. We do not permit them to use your data for their own commercial purposes.</P>
        </Section>

        <Section title="5. Data Security">
          <Ul items={[
            'Encryption in transit (TLS/HTTPS) for all data',
            'Encryption at rest for stored files and database records',
            'Row-level security (RLS) ensuring users can only access their own organization\'s data',
            'Hashed passwords via Supabase Auth',
            'Access controls limiting which personnel can access production systems',
          ]} />
          <P>No system is perfectly secure. In the event of a data breach affecting your information, we will notify you as required by applicable law and take immediate remediation steps.</P>
        </Section>

        <Section title="6. Data Retention">
          <Ul items={[
            'We retain your data for as long as your account is active or as needed to provide services',
            'You may request deletion of your data at any time by contacting us',
            'We will delete or anonymize your personal data within 30 days of a verified deletion request, except where retention is required by law',
            'Backups may retain data for up to 90 days after deletion from the primary database',
          ]} />
        </Section>

        <Section title="7. Your Rights">
          <P>You have the right to access, correct, delete, export, and restrict processing of your personal data. To exercise any of these rights, contact us at <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 hover:underline">{CONTACT_EMAIL}</a>.</P>
        </Section>

        <Section title="8. Children's Privacy">
          <P>LexAlloc is intended solely for legal and insurance professionals. We do not knowingly collect personal information from anyone under 18 years of age.</P>
        </Section>

        <Section title="9. Changes to This Policy">
          <P>We may update this Privacy Policy from time to time. We will revise the effective date and notify registered users by email. We will never retroactively change this policy to permit data uses that were not permitted when you provided your data, without your explicit consent.</P>
        </Section>

        <Section title="10. Contact Us">
          <P>Questions or requests regarding this Privacy Policy:</P>
          <P><strong>LexAlloc</strong><br />Email: <a href={`mailto:${CONTACT_EMAIL}`} className="text-brand-600 hover:underline">{CONTACT_EMAIL}</a></P>
        </Section>

      </div>

      {/* Footer */}
      <footer className="border-t border-slate-200 px-6 py-6">
        <div className="max-w-3xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-sm text-slate-400">
          <p>© {new Date().getFullYear()} LexAlloc. All rights reserved.</p>
          <div className="flex gap-4">
            <Link to="/terms" className="hover:text-slate-700 transition-colors">Terms of Service</Link>
            <Link to="/privacy" className="hover:text-slate-700 transition-colors">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  )
}
