/**
 * Meta WhatsApp Cloud API Client
 * Official Graph API v21.0 dispatcher with sandbox fallback and timed delay support.
 */

interface SendResult {
  success: boolean;
  messageId?: string;
  simulated?: boolean;
  error?: string;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getApiConfig() {
  const token = process.env.WHATSAPP_TOKEN || "";
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || "";
  const isConfigured = Boolean(token && phoneNumberId);

  return { token, phoneNumberId, isConfigured };
}

/**
 * Dispatch raw payload to Meta WhatsApp Cloud API
 */
async function sendMetaRequest(payload: Record<string, unknown>): Promise<SendResult> {
  const { token, phoneNumberId, isConfigured } = getApiConfig();

  if (!isConfigured) {
    console.log("[WhatsApp Mock Dispatch]", JSON.stringify(payload, null, 2));
    return {
      success: true,
      simulated: true,
      messageId: `sim_${Date.now()}`,
    };
  }

  try {
    const url = `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("[WhatsApp Meta API Error]", data);
      return { success: false, error: data?.error?.message || "Failed to send message" };
    }

    const messageId = data?.messages?.[0]?.id;
    return { success: true, messageId };
  } catch (err) {
    console.error("[WhatsApp Network Error]", err);
    return { success: false, error: String(err) };
  }
}

/**
 * Send standard plain-text message
 */
export async function sendTextMessage(to: string, text: string): Promise<SendResult> {
  return sendMetaRequest({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body: text },
  });
}

/**
 * Send interactive quick-reply buttons (Max 3 buttons supported by Meta)
 */
export async function sendQuickReplyButtons(
  to: string,
  bodyText: string,
  buttons: Array<{ id: string; title: string }>,
): Promise<SendResult> {
  const metaButtons = buttons.slice(0, 3).map((btn) => ({
    type: "reply",
    reply: {
      id: btn.id,
      title: btn.title.slice(0, 20), // Meta limit 20 characters
    },
  }));

  return sendMetaRequest({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: bodyText },
      action: { buttons: metaButtons },
    },
  });
}

/**
 * Send video message with an optional caption
 */
export async function sendVideoMessage(
  to: string,
  videoUrl: string,
  caption?: string,
): Promise<SendResult> {
  return sendMetaRequest({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "video",
    video: {
      link: videoUrl,
      caption: caption || undefined,
    },
  });
}

/**
 * Send interactive list message (e.g. for choosing available slots or days)
 */
export async function sendInteractiveList(
  to: string,
  headerText: string,
  bodyText: string,
  buttonLabel: string,
  sections: Array<{
    title: string;
    rows: Array<{ id: string; title: string; description?: string }>;
  }>,
): Promise<SendResult> {
  return sendMetaRequest({
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      header: { type: "text", text: headerText.slice(0, 60) },
      body: { text: bodyText },
      action: {
        button: buttonLabel.slice(0, 20),
        sections,
      },
    },
  });
}
