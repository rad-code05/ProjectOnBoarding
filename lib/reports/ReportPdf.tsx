import {
  Document,
  Image as PdfImage,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";

/** Laine colours (design/tokens.md). */
const INK = "#000000";
const SAND = "#F4F0EA";
const GRAPHITE = "#535353";
const LINE = "#dcd4c7";
const STONE = "#7e7e7e";

export type ReportPdfColumn = {
  label: string;
  /** Relative width of the column. */
  width: number;
  align?: "left" | "right";
};

/** Everything a report PDF shows (design/reports.md → Exports). */
export type ReportPdfInput = {
  title: string;
  group: string;
  definition: string;
  /** "16 Oct 2025 – 15 Oct 2026 (company time, Dubai)". */
  period: string;
  /** Active filters in words; empty = none. */
  filters: string[];
  generatedBy: string;
  /** "16 Oct 2026, 09:12 (Dubai)" — server time in the company timezone. */
  generatedAt: string;
  /** Wide tables print on a landscape page. */
  landscape?: boolean;
  tiles?: { label: string; value: string; note: string }[];
  /** One bar per item (Onboarded by month). */
  chart?: { title: string; bars: { label: string; value: number }[] };
  table: {
    columns: ReportPdfColumn[];
    rows: string[][];
    total?: string[];
  };
  /** Shown when the table is empty. */
  empty: string;
};

const s = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 48,
    paddingHorizontal: 36,
    fontFamily: "Raleway",
    fontSize: 8.5,
    color: INK,
  },
  band: {
    backgroundColor: INK,
    color: "#FFFFFF",
    marginHorizontal: -36,
    marginTop: -36,
    marginBottom: 16,
    paddingHorizontal: 36,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
  },
  logo: { width: 60, height: 22 },
  bandDivider: { width: 1, height: 24, backgroundColor: "#333333" },
  bandTitle: { fontFamily: "Newsreader", fontSize: 16 },
  bandSub: { fontSize: 8, color: STONE, marginTop: 2 },
  running: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7.5,
    color: GRAPHITE,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    paddingBottom: 5,
    marginBottom: 12,
  },
  eyebrow: {
    fontSize: 7.5,
    fontWeight: 700,
    letterSpacing: 1.2,
    color: GRAPHITE,
    textTransform: "uppercase",
  },
  title: { fontFamily: "Newsreader", fontSize: 22, marginTop: 3 },
  definition: {
    marginTop: 8,
    padding: 8,
    backgroundColor: SAND,
  },
  meta: { marginTop: 8, gap: 3, color: GRAPHITE },
  tiles: { flexDirection: "row", gap: 8, marginTop: 12 },
  tile: { flex: 1, borderWidth: 1, borderColor: LINE, padding: 8 },
  tileLabel: { fontSize: 7.5, color: GRAPHITE },
  tileValue: { fontFamily: "Newsreader", fontSize: 18, marginTop: 2 },
  tileNote: { fontSize: 7.5, color: GRAPHITE, marginTop: 1 },
  chartBox: { marginTop: 12, borderWidth: 1, borderColor: LINE, padding: 10 },
  chartTitle: { fontWeight: 700, marginBottom: 8 },
  plot: {
    height: 110,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 3,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
  },
  barCol: { flex: 1, alignItems: "center", justifyContent: "flex-end" },
  bar: {
    width: "60%",
    backgroundColor: INK,
    borderTopLeftRadius: 2,
    borderTopRightRadius: 2,
  },
  barValue: { fontSize: 6.5, color: GRAPHITE, marginBottom: 2 },
  axis: { flexDirection: "row", gap: 3, marginTop: 3 },
  axisLabel: { flex: 1, textAlign: "center", fontSize: 6.5, color: GRAPHITE },
  table: { marginTop: 14 },
  head: {
    flexDirection: "row",
    backgroundColor: INK,
    color: "#FFFFFF",
    fontWeight: 700,
  },
  row: {
    flexDirection: "row",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: LINE,
  },
  totalRow: { flexDirection: "row", fontWeight: 700, backgroundColor: SAND },
  cell: { paddingVertical: 4, paddingHorizontal: 5 },
  empty: { marginTop: 14, padding: 10, backgroundColor: SAND },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 7,
    color: GRAPHITE,
  },
});

function cells(values: string[], columns: ReportPdfColumn[]) {
  return values.map((value, i) => (
    <Text
      key={i}
      style={[
        s.cell,
        {
          flex: columns[i].width,
          textAlign: columns[i].align ?? "left",
        },
      ]}
    >
      {value}
    </Text>
  ));
}

/**
 * A report as PDF: black Laine band, name, definition, period and filters,
 * who made it and when, optional tiles and bar chart, then the table. The
 * running line and page numbers repeat on every page.
 */
export function ReportPdf({
  input,
  logo,
}: {
  input: ReportPdfInput;
  logo: Buffer;
}) {
  const { table } = input;
  const max = Math.max(1, ...(input.chart?.bars.map((b) => b.value) ?? [1]));
  return (
    <Document
      title={`${input.title} — Laine onboarding rights`}
      author={input.generatedBy}
      creator="Laine onboarding rights"
    >
      <Page
        size="A4"
        orientation={input.landscape ? "landscape" : "portrait"}
        style={s.page}
        wrap
      >
        <View style={s.band}>
          <PdfImage src={logo} style={s.logo} />
          <View style={s.bandDivider} />
          <View>
            <Text style={s.bandTitle}>Laine onboarding rights</Text>
            <Text style={s.bandSub}>Report</Text>
          </View>
        </View>
        <View style={s.running} fixed>
          <Text>{input.title}</Text>
          <Text>{input.period}</Text>
        </View>

        <Text style={s.eyebrow}>{input.group}</Text>
        <Text style={s.title}>{input.title}</Text>
        <Text style={s.definition}>
          <Text style={{ fontWeight: 700 }}>Definition: </Text>
          {input.definition}
        </Text>
        <View style={s.meta}>
          <Text>Period: {input.period}</Text>
          <Text>
            Filters: {input.filters.length ? input.filters.join(" · ") : "none"}
          </Text>
          <Text>
            Made by {input.generatedBy} on {input.generatedAt}. This export is
            recorded in the audit log.
          </Text>
        </View>

        {input.tiles && (
          <View style={s.tiles}>
            {input.tiles.map((t) => (
              <View key={t.label} style={s.tile}>
                <Text style={s.tileLabel}>{t.label}</Text>
                <Text style={s.tileValue}>{t.value}</Text>
                <Text style={s.tileNote}>{t.note}</Text>
              </View>
            ))}
          </View>
        )}

        {input.chart && input.chart.bars.length > 0 && (
          <View style={s.chartBox} wrap={false}>
            <Text style={s.chartTitle}>{input.chart.title}</Text>
            <View style={s.plot}>
              {input.chart.bars.map((b, i) => (
                <View key={i} style={s.barCol}>
                  {b.value > 0 && <Text style={s.barValue}>{b.value}</Text>}
                  <View
                    style={[s.bar, { height: (b.value / max) * 90 || 0 }]}
                  />
                </View>
              ))}
            </View>
            <View style={s.axis}>
              {input.chart.bars.map((b, i) => (
                <Text key={i} style={s.axisLabel}>
                  {b.label}
                </Text>
              ))}
            </View>
          </View>
        )}

        {table.rows.length === 0 ? (
          <Text style={s.empty}>{input.empty}</Text>
        ) : (
          <View style={s.table}>
            <View style={s.head} wrap={false}>
              {cells(
                table.columns.map((c) => c.label),
                table.columns,
              )}
            </View>
            {table.rows.map((row, i) => (
              <View key={i} style={s.row} wrap={false}>
                {cells(row, table.columns)}
              </View>
            ))}
            {table.total && (
              <View style={s.totalRow} wrap={false}>
                {cells(table.total, table.columns)}
              </View>
            )}
          </View>
        )}

        <View style={s.footer} fixed>
          <Text>
            {input.title} · made {input.generatedAt}
          </Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `Page ${pageNumber} of ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
