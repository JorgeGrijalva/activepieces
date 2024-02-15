
import { createPiece, PieceAuth } from "@activepieces/pieces-framework";
import { sendMessage } from "./lib/actions/send-message";

export const whatsableAuth =  PieceAuth.SecretText({
  displayName: "Whatsable Auth Token",
  description: "The auth token for Whatsable",
  required: true,
});

export const whatsable = createPiece({
  displayName: "Whatsable",
  auth: whatsableAuth,
  minimumSupportedRelease: '0.9.0',
  logoUrl: "https://cdn.activepieces.com/pieces/whatsable.png",
  authors: ['abuaboud'],
  actions: [sendMessage],
  triggers: [],
});
