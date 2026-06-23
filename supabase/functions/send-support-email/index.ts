const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
}

function jsonResponse(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  })
}

function escapeHtml(value: string) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;")
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders })
  }

  try {
    const resendApiKey = Deno.env.get("RESEND_API_KEY")
    const supportToEmail =
      Deno.env.get("SUPPORT_TO_EMAIL") || "contact.budgetkazpei@gmail.com"

    if (!resendApiKey) {
      return jsonResponse({ ok: false, error: "RESEND_API_KEY manquant" }, 500)
    }

    const body = await req.json()

    const userName = String(body.user_name || body.name || "Utilisateur BudgetKazPei")
    const userEmail = String(body.user_email || body.email || "")
    const type = String(body.type || "question")
    const subject = String(body.subject || "Question / besoin d’aide")
    const message = String(body.message || "")
    const source = String(body.source || "contact")
    const messageId = body.message_id ? String(body.message_id) : ""

    if (!userEmail || !message) {
      return jsonResponse({ ok: false, error: "Email ou message manquant" }, 400)
    }

    const emailSubject = `[BudgetKazPei] ${subject}`

    const text = `
Nouveau message BudgetKazPei

Nom : ${userName}
Email utilisateur : ${userEmail}
Type : ${type}
Source : ${source}
${messageId ? `ID Supabase : ${messageId}` : ""}

Message :
${message}
`.trim()

    const html = `
      <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #0f172a;">
        <h2>📧 Nouveau message BudgetKazPei</h2>
        <p><strong>Nom :</strong> ${escapeHtml(userName)}</p>
        <p><strong>Email utilisateur :</strong> ${escapeHtml(userEmail)}</p>
        <p><strong>Type :</strong> ${escapeHtml(type)}</p>
        <p><strong>Source :</strong> ${escapeHtml(source)}</p>
        ${messageId ? `<p><strong>ID Supabase :</strong> ${escapeHtml(messageId)}</p>` : ""}
        <hr />
        <p><strong>Message :</strong></p>
        <div style="white-space: pre-wrap; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px; padding:12px;">
          ${escapeHtml(message)}
        </div>
      </div>
    `

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "BudgetKazPei <onboarding@resend.dev>",
        to: [supportToEmail],
        reply_to: userEmail,
        subject: emailSubject,
        text,
        html,
      }),
    })

    const data = await response.json().catch(() => ({}))

    console.log("RESEND STATUS:", response.status)
    console.log("RESEND RESPONSE:", JSON.stringify(data))

    if (!response.ok) {
      return jsonResponse(
        {
          ok: false,
          error: data?.message || "Erreur Resend",
          details: data,
        },
        500
      )
    }

    return jsonResponse({
      ok: true,
      email_id: data?.id || null,
    })
  } catch (error) {
    console.error("Erreur send-support-email:", error)

    return jsonResponse(
      {
        ok: false,
        error: error?.message || "Erreur inconnue",
      },
      500
    )
  }
})