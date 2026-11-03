import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import nodemailer from "npm:nodemailer";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { smtp_config, test_email } = await req.json();

    if (!test_email) {
      throw new Error('Test email address is required');
    }

    if (!smtp_config || !smtp_config.host) {
      throw new Error('SMTP Configuration is missing or incomplete');
    }

    // 1. Prepare Email Content
    const subject = `Test Email from NHG Tasks Admin Console`;
    const htmlBody = `
      <h1>SMTP Test Configuration Success!</h1>
      <p>This is a test email sent from the Admin Console to verify your SMTP settings.</p>
      <hr />
      <p><strong>SMTP Host:</strong> ${smtp_config.host}</p>
      <p><strong>Sent to:</strong> ${test_email}</p>
      <p><strong>Time:</strong> ${new Date().toLocaleString()}</p>
    `;

    // 2. Send Email via Nodemailer
    const transporter = nodemailer.createTransport({
      host: smtp_config.host,
      port: smtp_config.port,
      secure: smtp_config.secure, // true for 465, false for other ports
      auth: {
        user: smtp_config.user,
        pass: smtp_config.password,
      },
      tls: {
        // Many providers require this for custom SMTP
        rejectUnauthorized: false
      }
    });

    const mailOptions = {
      from: `"${smtp_config.fromName || 'NHG Tasks'}" <${smtp_config.fromEmail || smtp_config.user}>`,
      to: test_email,
      subject: subject,
      html: htmlBody,
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Test message sent: %s', info.messageId);

    return new Response(
      JSON.stringify({ 
        message: 'Test email sent successfully!', 
        messageId: info.messageId 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Edge Function Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'An unexpected error occurred during SMTP test' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    );
  }
});
