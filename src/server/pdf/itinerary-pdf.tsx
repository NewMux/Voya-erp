import {
  Document,
  Page,
  StyleSheet,
  Text,
  View,
  renderToBuffer,
} from '@react-pdf/renderer';
import { formatDate } from '@/lib/dates';

/**
 * Group Adventure itinerary PDF — change request #6.
 *
 * English only: unlike the invoice, nothing in the change request asks for a
 * bilingual itinerary, so this skips the Arabic font registration entirely.
 */

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
  headerRight: { alignItems: 'flex-end' },
  docTitle: { fontSize: 16, fontFamily: 'Helvetica-Bold', textAlign: 'right' },
  docMeta: { fontSize: 9, color: MUTED, marginTop: 4 },
  tripName: { fontSize: 18, fontFamily: 'Helvetica-Bold', marginBottom: 4 },
  tripMeta: { fontSize: 10, color: MUTED, marginBottom: 20 },
  sectionLabel: {
    fontSize: 8,
    color: MUTED,
    letterSpacing: 1,
    fontFamily: 'Helvetica-Bold',
    marginBottom: 8,
    marginTop: 16,
  },
  dayRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: RULE,
  },
  dayNumber: { width: 60, fontFamily: 'Helvetica-Bold', fontSize: 10 },
  dayBody: { flex: 1 },
  dayTitle: { fontSize: 10, fontFamily: 'Helvetica-Bold' },
  dayDescription: { fontSize: 9, color: MUTED, marginTop: 2 },
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
  th: { fontSize: 7, color: MUTED, letterSpacing: 0.5, fontFamily: 'Helvetica-Bold' },
  td: { fontSize: 9 },
  colName: { flex: 2 },
  colType: { flex: 1 },
  colPassport: { flex: 1.2 },
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

export type ItineraryPdfInput = {
  tripName: string;
  destination: string | null;
  departureDate: Date;
  returnDate: Date | null;
  tourLeaderName: string | null;
  itineraryDays: Array<{ dayNumber: number; title: string; description: string | null }>;
  roster: Array<{ fullName: string; type: string; passportNumber: string | null }>;
  company: Record<string, string>;
};

export async function renderItineraryPdf(input: ItineraryPdfInput): Promise<Buffer> {
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
            <Text style={styles.docTitle}>Itinerary</Text>
            <Text style={styles.docMeta}>{companyName}</Text>
          </View>
        </View>

        <Text style={styles.tripName}>{input.tripName}</Text>
        <Text style={styles.tripMeta}>
          {input.destination ? `${input.destination} · ` : ''}
          Departs {formatDate(input.departureDate)}
          {input.returnDate ? ` · Returns ${formatDate(input.returnDate)}` : ''}
          {input.tourLeaderName ? ` · Tour leader: ${input.tourLeaderName}` : ''}
        </Text>

        {input.itineraryDays.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>DAY-BY-DAY ITINERARY</Text>
            {input.itineraryDays.map((day) => (
              <View key={day.dayNumber} style={styles.dayRow}>
                <Text style={styles.dayNumber}>Day {day.dayNumber}</Text>
                <View style={styles.dayBody}>
                  <Text style={styles.dayTitle}>{day.title}</Text>
                  {day.description ? (
                    <Text style={styles.dayDescription}>{day.description}</Text>
                  ) : null}
                </View>
              </View>
            ))}
          </>
        ) : null}

        {input.roster.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>TRAVELERS</Text>
            <View style={styles.tableHead}>
              <Text style={[styles.th, styles.colName]}>Name</Text>
              <Text style={[styles.th, styles.colType]}>Type</Text>
              <Text style={[styles.th, styles.colPassport]}>Passport</Text>
            </View>
            {input.roster.map((row, index) => (
              <View key={index} style={styles.row}>
                <Text style={[styles.td, styles.colName]}>{row.fullName}</Text>
                <Text style={[styles.td, styles.colType]}>{row.type}</Text>
                <Text style={[styles.td, styles.colPassport]}>{row.passportNumber ?? '—'}</Text>
              </View>
            ))}
          </>
        ) : null}

        <Text style={styles.footer} fixed>
          {companyName}
          {input.company['company.phone'] ? ` · ${input.company['company.phone']}` : ''}
          {input.company['company.email'] ? ` · ${input.company['company.email']}` : ''}
        </Text>
      </Page>
    </Document>,
  );
}
