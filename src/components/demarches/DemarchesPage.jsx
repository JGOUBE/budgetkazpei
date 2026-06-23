import { ClipboardList, Clock, CheckCircle2, XCircle, Send } from "lucide-react"

const COLORS = {
  card: "#0F1E38",
  border: "#1E3A5F",
  text: "#F1F5F9",
  muted: "#8EA4C5",
  accent: "#F97316",
  cyan: "#23D3D6",
  green: "#22C55E",
  yellow: "#FACC15",
  blue: "#38BDF8",
  red: "#EF4444",
}

export default function DemarchesPage({
  demarches = [],
  language = "fr",
}) {
  const isKreol = language === "kreol"

  const texts = {
    title: isKreol ? "Mon bann démarch" : "Mes démarches",
    subtitle: isKreol
      ? "Suiv tout bann démarch ou la ajouté."
      : "Retrouvez ici toutes les aides et démarches ajoutées.",
    emptyTitle: isKreol
      ? "Ou nana pa ankor démarch."
      : "Vous n'avez pas encore de démarche ajoutée.",
    emptyText: isKreol
      ? "Ajout in led dann Aides & Droits pou komans suiv a li."
      : "Ajoutez une aide depuis Aides & Droits pour commencer votre suivi.",
  }

  function getStatusInfo(status) {
    switch (status) {
      case "accepted":
        return {
          color: COLORS.green,
          icon: <CheckCircle2 size={16} />,
          label: isKreol ? "Aksepté" : "Accepté",
        }

      case "sent":
        return {
          color: COLORS.yellow,
          icon: <Send size={16} />,
          label: isKreol ? "Dosié anvoyé" : "Dossier envoyé",
        }

      case "waiting":
        return {
          color: COLORS.blue,
          icon: <Clock size={16} />,
          label: isKreol ? "An atant" : "En attente",
        }

      case "refused":
        return {
          color: COLORS.red,
          icon: <XCircle size={16} />,
          label: isKreol ? "Refizé" : "Refusé",
        }

      default:
        return {
          color: COLORS.accent,
          icon: <ClipboardList size={16} />,
          label: isKreol ? "A préparé" : "À préparer",
        }
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <div
        style={{
          background:
            "linear-gradient(135deg, rgba(249,115,22,.15), rgba(35,211,214,.08))",
          border: `1px solid ${COLORS.border}`,
          borderRadius: 24,
          padding: 24,
        }}
      >
        <div
          style={{
            fontSize: 34,
            fontWeight: 900,
            color: COLORS.text,
            marginBottom: 8,
          }}
        >
          📋 {texts.title}
        </div>

        <div
          style={{
            color: COLORS.muted,
            fontSize: 15,
          }}
        >
          {texts.subtitle}
        </div>
      </div>

      {demarches.length === 0 ? (
        <div
          style={{
            background: COLORS.card,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 24,
            padding: 40,
            textAlign: "center",
          }}
        >
          <div
            style={{
              fontSize: 52,
              marginBottom: 12,
            }}
          >
            📭
          </div>

          <div
            style={{
              color: COLORS.text,
              fontSize: 22,
              fontWeight: 800,
              marginBottom: 10,
            }}
          >
            {texts.emptyTitle}
          </div>

          <div
            style={{
              color: COLORS.muted,
              fontSize: 15,
            }}
          >
            {texts.emptyText}
          </div>
        </div>
      ) : (
        demarches.map(demarche => {
          const status = getStatusInfo(demarche.status)

          return (
            <div
              key={demarche.id}
              style={{
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 22,
                padding: 20,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 12,
                }}
              >
                <div>
                  <div
                    style={{
                      color: COLORS.text,
                      fontSize: 22,
                      fontWeight: 900,
                    }}
                  >
                    {demarche.title}
                  </div>

                  <div
                    style={{
                      color: COLORS.muted,
                      marginTop: 4,
                    }}
                  >
                    {demarche.organisme || ""}
                  </div>
                </div>

                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    color: status.color,
                    fontWeight: 800,
                  }}
                >
                  {status.icon}
                  {status.label}
                </div>
              </div>

              {demarche.amount && (
                <div
                  style={{
                    marginTop: 16,
                    color: COLORS.green,
                    fontSize: 18,
                    fontWeight: 800,
                  }}
                >
                  💰 {demarche.amount} €
                </div>
              )}

              {demarche.documents?.length > 0 && (
                <div style={{ marginTop: 16 }}>
                  <div
                    style={{
                      color: COLORS.cyan,
                      fontWeight: 800,
                      marginBottom: 8,
                    }}
                  >
                    📄 Documents
                  </div>

                  {demarche.documents.map((doc, index) => (
                    <div
                      key={index}
                      style={{
                        color: COLORS.muted,
                        marginBottom: 4,
                      }}
                    >
                      • {doc}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })
      )}
    </div>
  )
}