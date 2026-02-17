/**
 * POST /api/invite — Send a board invitation email via Resend
 */

import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';

const getResend = () => new Resend(process.env.RESEND_API_KEY);

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, boardTitle, inviterName, token, role } = body as {
      email: string;
      boardTitle: string;
      inviterName: string;
      token: string;
      role: string;
    };

    if (!email || !token) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const inviteUrl = `${APP_URL}/invite/${token}`;

    const { error } = await getResend().emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'Collabry <onboarding@resend.dev>',
      to: [email],
      subject: `${inviterName || 'Someone'} invited you to collaborate on "${boardTitle}"`,
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
                    <!-- Header gradient bar -->
                    <tr>
                      <td style="height: 4px; background: linear-gradient(to right, #2563eb, #06b6d4, #10b981);"></td>
                    </tr>
                    <!-- Content -->
                    <tr>
                      <td style="padding: 40px 32px;">
                        <h1 style="margin: 0 0 8px; font-size: 22px; font-weight: 700; color: #0f172a;">
                          You&rsquo;re invited to collaborate!
                        </h1>
                        <p style="margin: 0 0 24px; font-size: 15px; color: #475569; line-height: 1.6;">
                          <strong style="color: #0f172a;">${inviterName || 'A team member'}</strong> has invited you to join
                          <strong style="color: #0f172a;">&ldquo;${boardTitle}&rdquo;</strong> on Collabry as ${role === 'viewer' ? 'a viewer' : 'an editor'}.
                        </p>
                        <!-- CTA Button -->
                        <table width="100%" cellpadding="0" cellspacing="0">
                          <tr>
                            <td align="center" style="padding: 8px 0 24px;">
                              <a href="${inviteUrl}" style="display: inline-block; padding: 12px 32px; background: linear-gradient(to right, #2563eb, #06b6d4, #10b981); color: #ffffff; font-size: 15px; font-weight: 600; text-decoration: none; border-radius: 12px; box-shadow: 0 4px 12px rgba(6, 182, 212, 0.3);">
                                Accept Invitation
                              </a>
                            </td>
                          </tr>
                        </table>
                        <p style="margin: 0 0 16px; font-size: 13px; color: #94a3b8; line-height: 1.5;">
                          Or copy and paste this link into your browser:<br />
                          <a href="${inviteUrl}" style="color: #0891b2; word-break: break-all;">${inviteUrl}</a>
                        </p>
                        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
                        <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                          This invitation expires in 7 days. If you didn&rsquo;t expect this email, you can safely ignore it.
                        </p>
                      </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                      <td style="padding: 16px 32px; background-color: #f8fafc; text-align: center;">
                        <p style="margin: 0; font-size: 12px; color: #94a3b8;">
                          Sent by <strong>Collabry</strong> — Real-time collaborative whiteboard
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
      console.error('[resend] Failed to send invite email:', error);
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
    console.error('[api/invite] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
