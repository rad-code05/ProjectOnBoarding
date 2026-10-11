import {
  Document,
  Image as PdfImage,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import {
  personName,
  TYPE_LABELS,
  type RequestType,
} from "@/lib/requests/labels";
import {
  formatInZone,
  recordSections,
  signatureOf,
  type RecordInput,
  type RecordSignature,
} from "./record";

/** Laine colours (design/tokens.md). */
const INK = "#000000";
const SAND = "#F4F0EA";
const GRAPHITE = "#535353";
const LINE = "#dcd4c7";
const STONE = "#7e7e7e";

const s = StyleSheet.create({
  page: {
    paddingTop: 36,
    paddingBottom: 56,
    paddingHorizontal: 36,
    fontFamily: "Raleway",
    fontSize: 9,
    color: INK,
  },
  band: {
    backgroundColor: INK,
    color: "#FFFFFF",
    marginHorizontal: -36,
    marginTop: -36,
    marginBottom: 18,
    paddingHorizontal: 36,
    paddingVertical: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  logo: { width: 60, height: 22 },
  bandDivider: { width: 1, height: 26, backgroundColor: "#333333" },
  bandTitle: { fontFamily: "Newsreader", fontSize: 20 },
  bandSub: { fontSize: 9, color: STONE, marginTop: 3 },
  running: {
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: GRAPHITE,
    borderBottomWidth: 1,
    borderBottomColor: LINE,
    paddingBottom: 6,
    marginBottom: 14,
  },
  section: { marginBottom: 12 },
  bar: {
    backgroundColor: INK,
    color: "#FFFFFF",
    fontWeight: 700,
    fontSize: 9.5,
    paddingVertical: 5,
    paddingHorizontal: 8,
  },
  row: {
    flexDirection: "row",
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: LINE,
  },
  label: {
    width: "38%",
    backgroundColor: SAND,
    paddingVertical: 4.5,
    paddingHorizontal: 8,
    fontWeight: 600,
  },
  value: { width: "62%", paddingVertical: 4.5, paddingHorizontal: 8 },
  signatures: { flexDirection: "row", gap: 14, marginTop: 8 },
  sigBlock: {
    flex: 1,
    borderWidth: 1,
    borderColor: LINE,
    padding: 10,
  },
  sigRole: {
    fontSize: 7.5,
    fontWeight: 700,
    letterSpacing: 1,
    color: GRAPHITE,
  },
  sigMark: { height: 48, justifyContent: "flex-end", marginTop: 6 },
  sigImage: { maxHeight: 44, maxWidth: 180, objectFit: "contain" },
  sigTyped: {
    fontFamily: "Instrument Serif",
    fontStyle: "italic",
    fontSize: 28,
  },
  sigLine: { height: 1, backgroundColor: INK, marginVertical: 6 },
  sigName: { fontWeight: 700 },
  small: { fontSize: 8, color: GRAPHITE, marginTop: 2 },
  statement: { fontSize: 8, color: GRAPHITE, marginTop: 10, lineHeight: 1.4 },
  footer: {
    position: "absolute",
    bottom: 22,
    left: 36,
    right: 36,
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    fontSize: 7,
    color: GRAPHITE,
    borderTopWidth: 1,
    borderTopColor: LINE,
    paddingTop: 6,
  },
});

/**
 * The PDF record (2+ A4 pages): black band, sections 1–10 as tables,
 * section 11 with both signatures, and on every page the footer with the
 * fingerprint of the approval snapshot and "Page X of Y".
 */
export function RecordPdf({
  input,
  logo,
}: {
  input: RecordInput;
  /** The white Laine logo (PNG). */
  logo: Buffer;
}) {
  const r = input.snapshot.request;
  const name = personName(r.first_name, r.last_name) || r.ticket_id;
  const typeLabel = TYPE_LABELS[r.type as RequestType] ?? r.type;
  const generated = formatInZone(input.generatedAt, input.timezone);

  return (
    <Document
      title={`${name} — User Access Management Record`}
      subject={`${typeLabel} · ${r.ticket_id}`}
      author="Laine onboarding rights"
      creator="Laine onboarding rights"
      producer="Laine onboarding rights"
      language="en"
      creationDate={new Date(input.generatedAt)}
    >
      <Page size="A4" style={s.page}>
        <View style={s.band}>
          <PdfImage src={{ data: logo, format: "png" }} style={s.logo} />
          <View style={s.bandDivider} />
          <View>
            <Text style={s.bandTitle}>User Access Management Record</Text>
            <Text style={s.bandSub}>
              {typeLabel} · {r.ticket_id} · Form v{r.form_version}
            </Text>
          </View>
        </View>

        <View
          fixed
          render={({ pageNumber }) =>
            pageNumber > 1 ? (
              <View style={s.running}>
                <Text>
                  {name} · {r.ticket_id}
                </Text>
                <Text>User Access Management Record</Text>
              </View>
            ) : null
          }
        />

        {recordSections(input).map((section) => (
          <View key={section.number} style={s.section} wrap={false}>
            <Text style={s.bar}>
              {section.number}. {section.title}
            </Text>
            {section.rows.map((row, i) => (
              <View key={i} style={s.row}>
                <Text style={s.label}>{row.label}</Text>
                <Text style={s.value}>{row.value}</Text>
              </View>
            ))}
          </View>
        ))}

        <View style={s.section} wrap={false}>
          <Text style={s.bar}>{"11. Signatures & sign-off"}</Text>
          <View style={s.signatures}>
            <SignatureBlock
              role="IT EXECUTION (SECTION 9)"
              title="IT execution owner"
              signature={signatureOf(input, "it_execution")}
              timezone={input.timezone}
            />
            <SignatureBlock
              role="AUTHORIZING APPROVER (SECTIONS 3, 10)"
              title="Approver"
              signature={signatureOf(input, "final_confirmation")}
              timezone={input.timezone}
            />
          </View>
          <Text style={s.statement}>
            Signatures are applied by the authenticated signer after confirming
            the summary; they record that the process was done (internal
            acknowledgment). The audit trail — signer identity, server
            timestamps and the snapshot fingerprint — is kept in Laine
            onboarding rights.
          </Text>
        </View>

        <View style={s.footer} fixed>
          <Text style={{ flex: 1 }}>
            {input.fileName} · Generated {generated} ({input.timezone}) from the
            signed snapshot · SHA-256 {input.fingerprint}
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

function SignatureBlock({
  role,
  title,
  signature,
  timezone,
}: {
  role: string;
  title: string;
  signature: RecordSignature | null;
  timezone: string;
}) {
  return (
    <View style={s.sigBlock}>
      <Text style={s.sigRole}>{role}</Text>
      <View style={s.sigMark}>
        {signature?.image ? (
          <PdfImage
            src={{ data: signature.image, format: "png" }}
            style={s.sigImage}
          />
        ) : (
          <Text style={s.sigTyped}>{signature?.typedText ?? ""}</Text>
        )}
      </View>
      <View style={s.sigLine} />
      <Text style={s.sigName}>
        {signature ? `${signature.signerName} · ${title}` : "Not signed"}
      </Text>
      {signature && (
        <Text style={s.small}>
          Signed {formatInZone(signature.signedAt, timezone)} ({timezone},
          server time)
        </Text>
      )}
    </View>
  );
}
