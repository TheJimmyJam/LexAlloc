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

export default function TermsOfService() {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <div className="bg-slate-900 px-6 py-10">
        <div className="max-w-3xl mx-auto">
          <Link to="/" className="text-slate-400 hover:text-white text-sm transition-colors mb-6 inline-block">← Back to LexAlloc</Link>
          <h1 className="text-3xl font-bold text-white">Terms of Service</h1>
          <p className="text-slate-400 mt-2 text-sm">Effective Date: {EFFECTIVE_DATE}</p>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-3xl mx-auto px-6 py-12">

        <P>
          Please read these Terms of Service ("Terms") carefully before using the LexAlloc platform. By creating an account or using LexAlloc in any way, you agree to be bound by these Terms. If you do not agree, do not use the platform.
        </P>

        <Section title="1. About LexAlloc">
          <P>LexAlloc is a multi-tenant SaaS platform that enables legal professionals and insurance carriers to apportion legal invoices across parties and insurers using time-on-risk analysis. The platform is operated by LexAlloc ("Company," "we," "our").</P>
        </Section>

        <Section title="2. Eligibility">
          <P>You must be at least 18 years of age and have the legal authority to enter into this agreement on behalf of yourself or the organization you represent. LexAlloc is intended for use by legal professionals, insurance professionals, and their authorized staff.</P>
        </Section>

        <Section title="3. Account Registration and Security">
          <P>To access LexAlloc, you must create an account. You agree to:</P>
          <Ul items={[
            'Provide accurate, complete, and current registration information',
            'Maintain the security of your password and not share account credentials',
            `Notify us immediately at ${CONTACT_EMAIL} of any unauthorized access to your account`,
            'Be responsible for all activity that occurs under your account',
          ]} />
          <P>We reserve the right to suspend or terminate accounts we reasonably believe have been compromised or are being used in violation of these Terms.</P>
        </Section>

        <Section title="4. Acceptable Use">
          <SubSection title="4.1 Permitted Use">
            <P>You may use LexAlloc solely to:</P>
            <Ul items={[
              'Upload and parse legal invoices for apportionment purposes',
              'Manage legal matters, party information, and insurance policy data',
              'Generate and review apportionment calculations',
              'Receive email notifications related to your matters',
            ]} />
          </SubSection>
          <SubSection title="4.2 Prohibited Conduct">
            <P>You agree not to:</P>
            <Ul items={[
              'Upload content that you do not have the legal right to share or process',
              'Attempt to gain unauthorized access to other users\' data or systems',
              'Reverse-engineer, decompile, or attempt to extract LexAlloc\'s source code',
              'Use LexAlloc to store, transmit, or process illegal content',
              'Use automated scripts or bots to scrape or bulk-download data without authorization',
              'Use LexAlloc in any manner that could damage, disable, or overburden our infrastructure',
              'Resell or sublicense LexAlloc to third parties without written authorization',
            ]} />
          </SubSection>
        </Section>

        <Section title="5. Data Ownership">
          <P>You retain full ownership of all data you upload to LexAlloc, including invoices, matter data, and related documents. We claim no ownership rights over your content.</P>
          <P>By uploading content, you grant LexAlloc a limited, non-exclusive license to process, store, and transmit that content solely to deliver the services described in these Terms. This license terminates when you delete the content or close your account.</P>
        </Section>

        <Section title="6. Privacy">
          <P>Our <Link to="/privacy" className="text-brand-600 hover:underline">Privacy Policy</Link>, incorporated herein by reference, describes in full how we collect, use, and protect your data. Our commitment is absolute: we will never sell or share your data for any purpose other than delivering the LexAlloc service to you.</P>
        </Section>

        <Section title="7. Confidentiality">
          <P>You may use LexAlloc to store confidential legal and insurance information. We treat all data stored on the platform as confidential and will not disclose it except as required to operate the service, as directed by you, or as required by law.</P>
        </Section>

        <Section title="8. Fees and Payment">
          <Ul items={[
            'Fees are due in advance on the billing cycle you select',
            'All fees are non-refundable unless otherwise stated in your subscription plan',
            'We reserve the right to modify pricing with 30 days\' written notice',
            'Failure to pay may result in suspension of access',
          ]} />
        </Section>

        <Section title="9. Intellectual Property">
          <P>LexAlloc and all associated software, designs, algorithms, and documentation are the exclusive intellectual property of the Company. These Terms do not grant you any ownership rights in the platform. You may not copy, modify, distribute, or create derivative works of LexAlloc without express written permission.</P>
        </Section>

        <Section title="10. Disclaimer of Warranties">
          <P className="uppercase text-xs font-medium text-slate-500">
            LEXALLOC IS PROVIDED "AS IS" AND "AS AVAILABLE." TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW, WE DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT.
          </P>
          <P>LexAlloc is a tool to assist with apportionment calculations. It does not provide legal or insurance advice. All results should be reviewed by a qualified professional before being relied upon.</P>
        </Section>

        <Section title="11. Limitation of Liability">
          <P>TO THE MAXIMUM EXTENT PERMITTED BY LAW, IN NO EVENT SHALL LEXALLOC BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR IN CONNECTION WITH YOUR USE OF THE PLATFORM.</P>
          <P>OUR TOTAL AGGREGATE LIABILITY TO YOU FOR ANY CLAIM SHALL NOT EXCEED THE GREATER OF (A) THE FEES YOU PAID TO LEXALLOC IN THE TWELVE MONTHS PRECEDING THE CLAIM, OR (B) ONE HUNDRED U.S. DOLLARS ($100).</P>
        </Section>

        <Section title="12. Indemnification">
          <P>You agree to indemnify, defend, and hold harmless LexAlloc and its officers, directors, employees, and agents from any claims, damages, losses, liabilities, costs, and expenses (including reasonable attorneys' fees) arising from: (a) your use of the platform in violation of these Terms; (b) your violation of any applicable law or regulation; or (c) your infringement of any third-party rights.</P>
        </Section>

        <Section title="13. Termination">
          <P>Either party may terminate your account at any time. Upon termination, your right to use LexAlloc ceases immediately. Sections 9, 10, 11, 12, 14, and 15 survive termination.</P>
        </Section>

        <Section title="14. Governing Law">
          <P>These Terms are governed by the laws of the State of Texas, without regard to its conflict-of-law provisions. Any dispute shall be resolved exclusively in the state or federal courts located in Dallas County, Texas.</P>
        </Section>

        <Section title="15. General Provisions">
          <Ul items={[
            'Entire Agreement: These Terms and our Privacy Policy constitute the entire agreement between you and LexAlloc.',
            'Severability: If any provision is found unenforceable, the remaining provisions continue in full force.',
            'Waiver: Our failure to enforce any provision is not a waiver of our right to do so in the future.',
            `Notices: Legal notices to us must be sent to ${CONTACT_EMAIL}.`,
          ]} />
        </Section>

        <Section title="16. Changes to These Terms">
          <P>We may update these Terms from time to time. We will notify registered users by email and post updated Terms with a revised effective date. Continued use after posting constitutes acceptance.</P>
        </Section>

        <Section title="17. Contact">
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
