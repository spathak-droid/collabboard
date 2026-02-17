/**
 * POST /api/invite-app — Send an app-level invitation email via Resend
 * Invites someone to join Collabry (no specific board).
 */

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const getResend = () => new Resend(process.env.RESEND_API_KEY);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, inviterName } = body as { email: string; inviterName: string };

    if (!email) {
      return NextResponse.json({ error: 'Missing email' }, { status: 400 });
    }

    const signupUrl = `${APP_URL}/signup`;

    const { error } = await getResend().emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Collabry <onboarding@resend.dev>',
      to: [email],
      subject: `${inviterName || 'Someone'} invited you to join Collabry`,
      html: `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          </head>
          <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8fafc; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="100%" cellpadding="0" cellspacing="0" style="max-width: 480px; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0, 0, 0, 0.06);">
                    <tr>
                      <td style="height: 4px; background: linear-gradient(to right, #2563eb, #06b6d4, #10b981);"></td>
                    </tr>
                    <tr>
                      <td style="padding: 40px 32px;">
                        <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #0f172a;">
                          You&rsquo;re invited to Collabry!
                        </h1>
                        <p style="margin: 0 0 24px; font-size: 15px; color: #475569; line-height: 1.6;">
                          <strong style="color: #0f172a;">${inviterName || 'A team member'}</strong> has invited you to join
                          <strong style="color: #0f172a;">Collabry</strong> &mdash; a real-time collaborative whiteboard where teams brainstorm, plan, and create together.
                        </p>
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td align="center" style="padding: 8px 0 24px;">
                              <a href="${signupUrl}" style="display: inline-block; padding: 12px 32px; background: linear-gradient(to right, #2563eb, #06b6d4, #10b981); color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 12px; box-shadow: 0 4px 12px rgba(6, 182, 212, 0.3);">
                                Join Collabry
                              </a>
                            </td>
                          </tr>
                        </table>
                        <p style="margin: 0 0 16px; font-size: 13px; color: #94a3b8; line-height: 1.5;">
                          Or copy and paste this link into your browser:<br />
                          <a href="${signupUrl}" style="color: #0891b2; word-break: break-all;">${signupUrl}</a>
                        </p>
                        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                        <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                          If you didn&rsquo;t expect this email, you can safely ignore it.
                        </p>
                      </td>
                    </tr>
                    <tr>
                      <td style="padding: 16px 32px; background-color: #f8fafc; text-align: center;">
                        <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                          Sent by <strong>Collabry</strong> &mdash; Real-time collaborative whiteboard
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
        </html>
      `,
    });

    if (error) {
      console.error('[resend] Failed to send app invite email:', error);
      const msg = (error as { message?: string }).message || 'Failed to send email';
      if (msg.includes('only send testing emails')) {
        return NextResponse.json(
          { error: 'Resend is in test mode. You can only send to your own email. Verify a domain at resend.com/domains to send to anyone.' },
          { status: 403 }
        );
      }
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('[api/invite-app] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
