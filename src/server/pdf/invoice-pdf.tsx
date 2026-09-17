import { join } from 'node:path';
import {
  Document,
  Font,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import type { Style } from '@react-pdf/types';
import type { InvoiceLanguage } from '@prisma/client';
import { formatDate } from '@/lib/dates';
import { formatMoney, formatMoneyAr, type CurrencyCode } from '@/lib/money';

/**
 * Branded invoice PDF — PRD section 4.2.
 *
 * Rendered with @react-pdf/renderer rather than headless Chromium: no browser
 * binary in the Coolify image, and no per-request process spawn.
 *
 * Cost price and margin never appear here. The PRD is explicit that cost is
 * hidden from client documents, so this component is only ever handed the
 * customer-facing figures.
 */

const FONT_DIR = join(process.cwd(), 'src/server/pdf/fonts');

let fontsRegistered = false;

/**
 * Register the Arabic face once per process.
 *
 * The built-in Helvetica has no Arabic glyphs, so without this the AR and
 * bilingual templates render Arabic as blank boxes. Noto Naskh Arabic is
 * vendored under fonts/ (SIL OFL, see OFL.txt).
 */
function registerFonts(): void {
  if (fontsRegistered) return;

  Font.register({
    family: 'NotoNaskhArabic',
    fonts: [
      { src: join(FONT_DIR, 'NotoNaskhArabic-Regular.ttf') },
      { src: join(FONT_DIR, 'NotoNaskhArabic-Bold.ttf'), fontWeight: 'bold' },
    ],
  });

  // Arabic words must not be broken across lines by the Latin hyphenation
  // heuristic, which does not understand joined scripts.
  Font.registerHyphenationCallback((word) => [word]);

  fontsRegistered = true;
}

/** Any Arabic letter, used to decide which font a string needs. */
const ARABIC_RANGE = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;

const VOYA_TEAL = '#4CA7BC';
const INK = '#152B35';
const MUTED = '#64748B';
const RULE = '#E2E8EA';

const styles = StyleSheet.create({
  page: {
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 40,
    fontSize: 9.5,
    color: INK,
    fontFamily: 'Helvetica',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    borderBottomWidth: 2,
    borderBottomColor: VOYA_TEAL,
    paddingBottom: 12,
    marginBottom: 16,
  },
  brand: { fontSize: 22, fontFamily: 'Helvetica-Bold', color: VOYA_TEAL, letterSpacing: 1 },
  brandSub: { fontSize: 7, color: VOYA_TEAL, letterSpacing: 2, marginTop: 2 },
  companyLine: { fontSize: 8, color: MUTED, marginTop: 6, maxWidth: 220 },
  docTitle: { fontSize: 16, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  docTitleAr: { marginTop: 2 },
  headerRight: { alignItems: 'flex-end' },
  docMeta: { fontSize: 9, color: MUTED },
  metaValue: { fontSize: 9, color: MUTED },
  // Label and value as separate nodes on one row; concatenating an Arabic
  // label with a Latin value makes a single bidirectional run that overlaps.
  metaRow: { flexDirection: 'row', gap: 4, marginTop: 4, alignItems: 'flex-end' },
  inlinePair: { flexDirection: 'row', gap: 3, marginTop: 2 },
  alignRight: { textAlign: 'right' },
  mutedText: { color: MUTED },
  boldText: { fontFamily: 'Helvetica-Bold' },
  brandAr: { fontSize: 9, marginTop: 3, textAlign: 'left' },
  lineAr: { fontSize: 8, color: MUTED, textAlign: 'left' },
  memberLine: { fontSize: 9, color: '#AA6F23', marginTop: 2 },
  notesLabelAr: { marginTop: 8 },
  notesTextAr: { textAlign: 'right' },
  termsLabel: { marginTop: 8 },
  footerAr: { textAlign: 'center' },

  partiesRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 18 },
  partyBlock: { width: '48%' },
  label: {
    fontSize: 7,
    color: MUTED,
    letterSpacing: 1,
    marginBottom: 3,
    fontFamily: 'Helvetica-Bold',
  },
  partyName: { fontSize: 11, fontFamily: 'Helvetica-Bold' },
  partyLine: { fontSize: 9, color: MUTED, marginTop: 2 },

  tableHead: {
    flexDirection: 'row',
    backgroundColor: '#F0F9FB',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: VOYA_TEAL,
  },
  row: {
    flexDirection: 'row',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: RULE,
  },
  colDesc: { width: '58%' },
  colQty: { width: '10%', textAlign: 'right' },
  colUnit: { width: '16%', textAlign: 'right' },
  colTotal: { width: '16%', textAlign: 'right' },
  headText: { fontSize: 7.5, fontFamily: 'Helvetica-Bold', color: VOYA_TEAL, letterSpacing: 0.5 },

  arabic: { fontFamily: 'NotoNaskhArabic', textAlign: 'right' },
  // The Arabic face with no alignment of its own, so it inherits its container's.
  arabicPlain: { fontFamily: 'NotoNaskhArabic' },
  arabicBold: { fontFamily: 'NotoNaskhArabic', fontWeight: 'bold', textAlign: 'right' },
  // Arabic face without an alignment of its own, for labels that sit beneath
  // an English label and should follow their container's alignment.
  arabicInline: { fontFamily: 'NotoNaskhArabic', fontWeight: 'bold' },
  arabicSmall: { fontFamily: 'NotoNaskhArabic', textAlign: 'right', fontSize: 8, color: MUTED },

  totals: { marginTop: 14, alignSelf: 'flex-end', width: '45%' },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 },
  grandRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 7,
    marginTop: 4,
    borderTopWidth: 2,
    borderTopColor: VOYA_TEAL,
  },
  grandText: { fontSize: 12, fontFamily: 'Helvetica-Bold' },

  statusPill: {
    marginTop: 8,
    alignSelf: 'flex-end',
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderRadius: 10,
    fontSize: 8,
    fontFamily: 'Helvetica-Bold',
  },

  notes: { marginTop: 22, paddingTop: 10, borderTopWidth: 1, borderTopColor: RULE },
  notesText: { fontSize: 8.5, color: MUTED, lineHeight: 1.5 },

  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    textAlign: 'center',
    fontSize: 7.5,
    color: MUTED,
    borderTopWidth: 1,
    borderTopColor: RULE,
    paddingTop: 8,
  },
});

export type InvoicePdfData = {
  number: string;
  issueDate: Date;
  dueDate: Date;
  status: string;
  language: InvoiceLanguage;
  currency: CurrencyCode;
  subtotal: string;
  discountTotal: string;
  total: string;
  paidAmount: string;
  balance: string;
  notes: string | null;
  notesAr: string | null;
  terms: string | null;
  customer: {
    fullName: string;
    companyName: string | null;
    crNumber: string | null;
    phone: string;
    email: string | null;
    membershipNumber: string | null;
  };
  lines: Array<{
    description: string;
    descriptionAr: string | null;
    quantity: string;
    unitPrice: string;
    lineTotal: string;
  }>;
  company: Record<string, string>;
};

/** Labels for both templates, so the bilingual layout stays in step. */
const L = {
  invoice: { en: 'INVOICE', ar: 'فاتورة' },
  billTo: { en: 'BILL TO', ar: 'فاتورة إلى' },
  from: { en: 'FROM', ar: 'من' },
  number: { en: 'Invoice no.', ar: 'رقم الفاتورة' },
  issued: { en: 'Issued', ar: 'تاريخ الإصدار' },
  due: { en: 'Due', ar: 'تاريخ الاستحقاق' },
  description: { en: 'Description', ar: 'الوصف' },
  qty: { en: 'Qty', ar: 'الكمية' },
  unitPrice: { en: 'Unit price', ar: 'سعر الوحدة' },
  amount: { en: 'Amount', ar: 'المبلغ' },
  subtotal: { en: 'Subtotal', ar: 'المجموع الفرعي' },
  discount: { en: 'Discount', ar: 'الخصم' },
  total: { en: 'Total', ar: 'الإجمالي' },
  paid: { en: 'Paid', ar: 'المدفوع' },
  balance: { en: 'Balance due', ar: 'المبلغ المستحق' },
  member: { en: 'Member', ar: 'رقم العضوية' },
  cr: { en: 'CR', ar: 'السجل التجاري' },
  notes: { en: 'Notes', ar: 'ملاحظات' },
  terms: { en: 'Terms', ar: 'الشروط' },
  thanks: {
    en: 'Thank you for travelling with Voya.',
    ar: 'شكراً لسفركم مع فويا.',
  },
} as const;

function statusTone(status: string): { bg: string; color: string } {
  switch (status) {
    case 'PAID':
      return { bg: '#D1FAE5', color: '#065F46' };
    case 'OVERDUE':
      return { bg: '#FEE2E2', color: '#991B1B' };
    case 'PARTIALLY_PAID':
      return { bg: '#FEF3C7', color: '#92400E' };
    default:
      return { bg: '#F1F5F9', color: '#334155' };
  }
}

/**
 * Text that picks its font from its own content.
 *
 * Every Arabic string in this document goes through here. The built-in
 * Helvetica has no Arabic glyphs, so an Arabic label rendered with an inherited
 * Latin style comes out as transliterated mojibake — and because the styles are
 * merged left to right, a caller's `fontFamily: 'Helvetica-Bold'` would silently
 * win. Appending the Arabic face last, only when the string actually contains
 * Arabic, makes that impossible to get wrong.
 */
function Txt({
  children,
  style,
  bold,
}: {
  children: string;
  style?: Style | Style[];
  bold?: boolean;
}) {
  const base = Array.isArray(style) ? style : style ? [style] : [];
  const arabic = ARABIC_RANGE.test(children);
  return (
    <Text style={arabic ? [...base, bold ? styles.arabicInline : styles.arabicPlain] : base}>
      {children}
    </Text>
  );
}

/** A label rendered in each language the active template shows. */
function Label({
  k,
  style,
  showEn,
  showAr,
}: {
  k: keyof typeof L;
  style?: Style;
  showEn: boolean;
  showAr: boolean;
}) {
  return (
    <>
      {showEn ? <Text style={style}>{L[k].en}</Text> : null}
      {showAr ? (
        <Txt style={style} bold>
          {L[k].ar}
        </Txt>
      ) : null}
    </>
  );
}

/**
 * A label/value pair on its own row.
 *
 * Deliberately two Text nodes rather than one concatenated string: an Arabic
 * label and a Latin value in a single run are laid out as one bidirectional
 * paragraph and overlap each other.
 */
function Meta({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metaRow}>
      <Txt style={styles.docMeta}>{label}</Txt>
      <Text style={styles.metaValue}>{value}</Text>
    </View>
  );
}

function InvoiceDocument({ data }: { data: InvoicePdfData }) {
  const showEn = data.language === 'EN' || data.language === 'BILINGUAL';
  const showAr = data.language === 'AR' || data.language === 'BILINGUAL';
  const arOnly = data.language === 'AR';

  /** The label for a single-language template. */
  const t = (k: keyof typeof L) => (showEn ? L[k].en : L[k].ar);

  const money = (value: string) =>
    arOnly ? formatMoneyAr(value, data.currency) : formatMoney(value, data.currency);

  const tone = statusTone(data.status);

  return (
    <Document
      title={`Invoice ${data.number}`}
      author={data.company['company.name'] ?? 'Voya Travel & Tourism'}
    >
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>VOYA</Text>
            <Text style={styles.brandSub}>TRAVEL &amp; TOURISM</Text>
            {showAr ? (
              <Txt style={styles.brandAr}>
                {data.company['company.nameAr'] ?? 'فويا للسفر والسياحة'}
              </Txt>
            ) : null}
            <Text style={styles.companyLine}>
              {data.company['company.address'] ?? ''}
              {data.company['company.phone'] ? `\n${data.company['company.phone']}` : ''}
              {data.company['company.email'] ? `\n${data.company['company.email']}` : ''}
            </Text>
          </View>

          <View style={styles.headerRight}>
            {showEn ? <Text style={styles.docTitle}>{L.invoice.en}</Text> : null}
            {showAr ? (
              <Txt style={[styles.docTitle, styles.docTitleAr]} bold>
                {L.invoice.ar}
              </Txt>
            ) : null}
            <Meta label={t('number')} value={data.number} />
            <Meta label={t('issued')} value={formatDate(data.issueDate)} />
            <Meta label={t('due')} value={formatDate(data.dueDate)} />
          </View>
        </View>

        <View style={styles.partiesRow}>
          <View style={styles.partyBlock}>
            <Label k="billTo" style={styles.label} showEn={showEn} showAr={showAr} />
            <Text style={styles.partyName}>
              {data.customer.companyName ?? data.customer.fullName}
            </Text>
            {data.customer.companyName ? (
              <Text style={styles.partyLine}>{data.customer.fullName}</Text>
            ) : null}
            <Text style={styles.partyLine}>{data.customer.phone}</Text>
            {data.customer.email ? (
              <Text style={styles.partyLine}>{data.customer.email}</Text>
            ) : null}
            {data.customer.crNumber ? (
              <View style={styles.inlinePair}>
                <Txt style={styles.partyLine}>{t('cr')}</Txt>
                <Text style={styles.partyLine}>{data.customer.crNumber}</Text>
              </View>
            ) : null}
            {data.customer.membershipNumber ? (
              <View style={styles.inlinePair}>
                <Txt style={styles.memberLine}>{t('member')}</Txt>
                <Text style={styles.memberLine}>{data.customer.membershipNumber}</Text>
              </View>
            ) : null}
          </View>
        </View>

        <View style={styles.tableHead}>
          <View style={styles.colDesc}>
            <Label k="description" style={styles.headText} showEn={showEn} showAr={showAr} />
          </View>
          <View style={styles.colQty}>
            <Txt style={[styles.headText, styles.alignRight]} bold>
              {t('qty')}
            </Txt>
          </View>
          <View style={styles.colUnit}>
            <Txt style={[styles.headText, styles.alignRight]} bold>
              {t('unitPrice')}
            </Txt>
          </View>
          <View style={styles.colTotal}>
            <Txt style={[styles.headText, styles.alignRight]} bold>
              {t('amount')}
            </Txt>
          </View>
        </View>

        {data.lines.map((line, index) => (
          <View key={index} style={styles.row} wrap={false}>
            <View style={styles.colDesc}>
              {showEn ? <Text>{line.description}</Text> : null}
              {showAr && line.descriptionAr ? (
                <Txt style={styles.lineAr}>{line.descriptionAr}</Txt>
              ) : null}
              {/* An Arabic-only invoice whose line has no Arabic text would
                  otherwise be an empty row. */}
              {arOnly && !line.descriptionAr ? <Text>{line.description}</Text> : null}
            </View>
            <Text style={styles.colQty}>{line.quantity}</Text>
            <Text style={styles.colUnit}>
              {formatMoney(line.unitPrice, data.currency, { withCode: false })}
            </Text>
            <Text style={styles.colTotal}>
              {formatMoney(line.lineTotal, data.currency, { withCode: false })}
            </Text>
          </View>
        ))}

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Txt style={styles.mutedText}>{t('subtotal')}</Txt>
            <Txt>{money(data.subtotal)}</Txt>
          </View>

          {Number.parseFloat(data.discountTotal) > 0 ? (
            <View style={styles.totalRow}>
              <Txt style={styles.mutedText}>{t('discount')}</Txt>
              <Txt>{`−${money(data.discountTotal)}`}</Txt>
            </View>
          ) : null}

          <View style={styles.grandRow}>
            <Txt style={styles.grandText} bold>
              {t('total')}
            </Txt>
            <Txt style={styles.grandText} bold>
              {money(data.total)}
            </Txt>
          </View>

          {Number.parseFloat(data.paidAmount) > 0 ? (
            <>
              <View style={styles.totalRow}>
                <Txt style={styles.mutedText}>{t('paid')}</Txt>
                <Txt>{money(data.paidAmount)}</Txt>
              </View>
              <View style={styles.totalRow}>
                <Txt style={styles.boldText} bold>
                  {t('balance')}
                </Txt>
                <Txt style={styles.boldText} bold>
                  {money(data.balance)}
                </Txt>
              </View>
            </>
          ) : null}

          <Text style={[styles.statusPill, { backgroundColor: tone.bg, color: tone.color }]}>
            {data.status.replace(/_/g, ' ')}
          </Text>
        </View>

        {(showEn && data.notes) || (showAr && data.notesAr) || data.terms ? (
          <View style={styles.notes}>
            {showEn && data.notes ? (
              <>
                <Text style={styles.label}>{L.notes.en}</Text>
                <Text style={styles.notesText}>{data.notes}</Text>
              </>
            ) : null}
            {showAr && data.notesAr ? (
              <>
                <Txt style={[styles.label, styles.notesLabelAr]} bold>
                  {L.notes.ar}
                </Txt>
                <Txt style={[styles.notesText, styles.notesTextAr]}>{data.notesAr}</Txt>
              </>
            ) : null}
            {data.terms ? (
              <>
                <Txt style={[styles.label, styles.termsLabel]} bold>
                  {t('terms')}
                </Txt>
                <Text style={styles.notesText}>{data.terms}</Text>
              </>
            ) : null}
          </View>
        ) : null}

        <View style={styles.footer} fixed>
          {showEn ? <Text>{L.thanks.en}</Text> : null}
          {showAr ? <Txt style={styles.footerAr}>{L.thanks.ar}</Txt> : null}
          <Text>
            {data.company['company.name'] ?? 'Voya Travel & Tourism'}
            {data.company['company.instagram'] ? ` · ${data.company['company.instagram']}` : ''}
          </Text>
        </View>
      </Page>
    </Document>
  );
}

/** Render an invoice to a PDF buffer. */
export async function renderInvoicePdf(data: InvoicePdfData): Promise<Buffer> {
  registerFonts();
  return renderToBuffer(<InvoiceDocument data={data} />);
}
