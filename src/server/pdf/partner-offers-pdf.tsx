import { Document, Page, StyleSheet, Text, View, renderToBuffer } from '@react-pdf/renderer';
import { formatDate } from '@/lib/dates';

/**
 * Partner offers directory — a printable/shareable list of active membership
 * benefits (change request #18). English only, same as the itinerary PDF.
 */

const VOYA_TEAL = '#4CA7BC';
const GOLD = '#B8860B';
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
  headerRight: { alignItems: 'flex-end' },
  docTitle: { fontSize: 16, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  docMeta: { fontSize: 9, color: MUTED, marginTop: 4 },
  intro: { fontSize: 10, color: MUTED, marginBottom: 20 },
  offer: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: RULE,
  },
  offerHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  offerName: { fontSize: 12, fontFamily: 'Helvetica-Bold', color: GOLD },
  offerCountry: { fontSize: 9, color: MUTED },
  offerDescription: { fontSize: 10, marginTop: 4 },
  offerTerms: { fontSize: 8, color: MUTED, marginTop: 4, fontStyle: 'italic' },
  footer: {
    position: 'absolute',
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 8,
    color: MUTED,
    textAlign: 'center',
  },
});

export type PartnerOffersPdfInput = {
  offers: Array<{
    name: string;
    country: string | null;
    description: string;
    termsAndConditions: string | null;
    agreementEnd: Date;
  }>;
  company: Record<string, string>;
};

export async function renderPartnerOffersPdf(input: PartnerOffersPdfInput): Promise<Buffer> {
  const companyName = input.company['company.name'] || 'Voya Travel & Tourism';

  return renderToBuffer(
    <Document>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>VOYA</Text>
            <Text style={styles.brandSub}>TRAVEL & TOURISM</Text>
          </View>
          <View style={styles.headerRight}>
            <Text style={styles.docTitle}>Member Benefits Directory</Text>
            <Text style={styles.docMeta}>{companyName}</Text>
          </View>
        </View>

        <Text style={styles.intro}>
          Exclusive offers from Voya&apos;s partner businesses — valid for active Voya members.
        </Text>

        {input.offers.map((offer, index) => (
          <View key={index} style={styles.offer} wrap={false}>
            <View style={styles.offerHead}>
              <Text style={styles.offerName}>{offer.name}</Text>
              <Text style={styles.offerCountry}>{offer.country ?? ''}</Text>
            </View>
            <Text style={styles.offerDescription}>{offer.description}</Text>
            {offer.termsAndConditions ? (
              <Text style={styles.offerTerms}>{offer.termsAndConditions}</Text>
            ) : null}
            <Text style={styles.offerTerms}>Valid until {formatDate(offer.agreementEnd)}</Text>
          </View>
        ))}

        <Text style={styles.footer} fixed>
          {companyName}
          {input.company['company.phone'] ? ` · ${input.company['company.phone']}` : ''}
          {input.company['company.email'] ? ` · ${input.company['company.email']}` : ''}
        </Text>
      </Page>
    </Document>,
  );
}
