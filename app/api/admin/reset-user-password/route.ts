import { NextResponse } from "next/server";
import { getApps, initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function initAdmin() {
  if (!getApps().length) {
    const projectId = process.env.FIREBASE_PROJECT_ID!;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL!;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY!.replace(/\\n/g, '\n');
    initializeApp({ credential: cert({ projectId, clientEmail, privateKey }) });
  }
  return getAuth();
}

export async function POST(req: Request) {
  try {
    const { userId, newPassword, sendResetEmail } = await req.json();
    
    if (!userId) {
      return NextResponse.json({ 
        error: "User ID richiesto" 
      }, { status: 400 });
    }

    const auth = initAdmin();
    
    // Ottieni informazioni utente
    let userRecord;
    try {
      userRecord = await auth.getUser(userId);
    } catch (error: any) {
      return NextResponse.json({ 
        error: `Utente non trovato: ${error.message}` 
      }, { status: 404 });
    }

    // Se richiesto, invia email di reset
    if (sendResetEmail) {
      try {
        const resetLink = await auth.generatePasswordResetLink(userRecord.email!);
        return NextResponse.json({
          success: true,
          message: "Link di reset password generato",
          resetLink: resetLink,
          userEmail: userRecord.email,
          note: "Invia questo link all'utente per resettare la password"
        });
      } catch (error: any) {
        return NextResponse.json({ 
          error: `Errore generazione link reset: ${error.message}` 
        }, { status: 500 });
      }
    }

    // Se fornita una nuova password, aggiorna direttamente
    if (newPassword) {
      if (newPassword.length < 6) {
        return NextResponse.json({ 
          error: "La password deve essere di almeno 6 caratteri" 
        }, { status: 400 });
      }

      try {
        await auth.updateUser(userId, {
          password: newPassword
        });

        return NextResponse.json({
          success: true,
          message: "Password aggiornata con successo",
          userId: userId,
          userEmail: userRecord.email,
          note: "La nuova password è stata impostata. Comunicala all'utente."
        });
      } catch (error: any) {
        return NextResponse.json({ 
          error: `Errore aggiornamento password: ${error.message}` 
        }, { status: 500 });
      }
    }

    // Se non è specificato né newPassword né sendResetEmail, genera una password temporanea
    const tempPassword = Math.random().toString(36).slice(-12) + Math.random().toString(36).slice(-12).toUpperCase() + '!1';
    
    try {
      await auth.updateUser(userId, {
        password: tempPassword
      });

      return NextResponse.json({
        success: true,
        message: "Password temporanea generata",
        userId: userId,
        userEmail: userRecord.email,
        tempPassword: tempPassword,
        note: "Comunica questa password all'utente. Consiglia di cambiarla al primo accesso."
      });
    } catch (error: any) {
      return NextResponse.json({ 
        error: `Errore generazione password temporanea: ${error.message}` 
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error("ERRORE /api/admin/reset-user-password:", error);
    return NextResponse.json({ 
      error: error.message || "Errore interno del server" 
    }, { status: 500 });
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');
    
    if (!userId) {
      return NextResponse.json({ 
        error: "User ID richiesto come parametro query: ?userId=..." 
      }, { status: 400 });
    }

    const auth = initAdmin();
    
    // Ottieni informazioni utente
    let userRecord;
    try {
      userRecord = await auth.getUser(userId);
    } catch (error: any) {
      return NextResponse.json({ 
        error: `Utente non trovato: ${error.message}` 
      }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        emailVerified: userRecord.emailVerified,
        disabled: userRecord.disabled,
        displayName: userRecord.displayName,
        createdAt: userRecord.metadata.creationTime,
        lastSignIn: userRecord.metadata.lastSignInTime
      },
      usage: {
        POST: {
          resetEmail: "POST con { userId, sendResetEmail: true } per generare link reset",
          setPassword: "POST con { userId, newPassword: '...' } per impostare nuova password",
          generateTemp: "POST con { userId } per generare password temporanea"
        }
      }
    });

  } catch (error: any) {
    console.error("ERRORE /api/admin/reset-user-password:", error);
    return NextResponse.json({ 
      error: error.message || "Errore interno del server" 
    }, { status: 500 });
  }
}

