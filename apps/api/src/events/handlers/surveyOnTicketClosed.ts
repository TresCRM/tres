import { bus } from "../emitter";
import { Survey } from "../../models/Survey";
import { SurveyInvite } from "../../models/SurveyInvite";
import { EmailTemplate } from "../../models/EmailTemplate";
import { renderVars } from "../../utils/render";
import { ENV } from "../../config/env";
import { sendEmail } from "../../services/mailer";
import * as jwt from "jsonwebtoken";
import { asObjectId } from "../../utils/auth";

export function surveyOnTicketClosed(appHost?: string) {
  bus.on("ticket", async (evt: any) => {
    if (evt?.event !== "ticket.closed") return;
    const { tenantId, ticketId, customerEmail } = evt;
    if (!tenantId || !ticketId || !customerEmail) return;

    const survey = await Survey.findOne({ tenantId: asObjectId(tenantId), key: "ticket_closure_csat", isActive: true });
    if (!survey) return;

    const ttlDays = ENV.SURVEY_TOKEN_TTL_DAYS;
    const token = jwt.sign({ tid: String(tenantId), sid: String(survey._id), tk: String(ticketId), em: customerEmail },
                           ENV.SURVEY_JWT_SECRET, { expiresIn: `${ttlDays}d` });
    const expiresAt = new Date(Date.now() + ttlDays*86400000);
    await SurveyInvite.create({
      tenantId: asObjectId(tenantId), surveyId: survey._id, ticketId: asObjectId(ticketId),
      customerEmail, token, expiresAt
    });

    const inviteUrl = `${appHost || "http://localhost:4000"}/public/surveys/${token}`;
    const tpl = await EmailTemplate.findOne({ tenantId: asObjectId(tenantId), key: ENV.SURVEY_DEFAULT_TEMPLATE_KEY })
             || await EmailTemplate.findOne({ tenantId: null, key: ENV.SURVEY_DEFAULT_TEMPLATE_KEY });

    const vars = { survey, inviteUrl, customer: { email: customerEmail } };
    const subject = ENV.SURVEY_DEFAULT_SUBJECT;
    const html = tpl ? renderVars(tpl.html, vars) : `Please take a quick survey: <a href="${inviteUrl}">Open</a>`;
    const text = tpl?.text ? renderVars(tpl.text, vars) : `Please take a quick survey: ${inviteUrl}`;
    await sendEmail({ to: customerEmail, subject, html, text, messageKey: `survey_auto_${ticketId}` });
  });
}
