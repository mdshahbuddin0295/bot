const { Server, Transaction, Networks } = require("stellar-sdk");

/**
 * Netlify Function: Submit Pi Network Transaction
 * 
 * This function receives a signed XDR transaction from the frontend,
 * validates it, and submits it to the Pi Network Horizon server.
 * 
 * Security Notes:
 * - Never store mnemonics or secret keys in this function
 * - The frontend should sign transactions client-side
 * - This function only handles already-signed transactions
 */

exports.handler = async function(event, context) {
  // CORS Headers for cross-origin requests
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*", // Configure appropriately for production
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json"
  };

  // Handle preflight OPTIONS request
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders,
      body: ""
    };
  }

  // Only allow POST requests
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "Method not allowed. Use POST."
      })
    };
  }

  try {
    // Parse and validate request body
    let requestBody;
    try {
      requestBody = JSON.parse(event.body);
    } catch (parseError) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Invalid JSON format in request body"
        })
      };
    }

    const { signedXdr } = requestBody;

    // Validate presence of signed XDR
    if (!signedXdr || typeof signedXdr !== "string") {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Missing or invalid 'signedXdr' parameter. Expected a string."
        })
      };
    }

    // Validate XDR format (basic check)
    if (!/^[A-Za-z0-9+/=]+$/.test(signedXdr)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Invalid XDR format. Must be base64 encoded."
        })
      };
    }

    // Initialize Pi Network Horizon server
    const horizonServer = new Server("https://api.mainnet.minepi.com");

    // Create Transaction object with correct Pi Network passphrase
    // Using Networks.PI_NETWORK constant instead of hardcoded string
    let transaction;
    try {
      transaction = new Transaction(signedXdr, Networks.PI_NETWORK);
    } catch (transactionError) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({
          success: false,
          error: "Failed to parse transaction XDR",
          details: transactionError.message
        })
      };
    }

    // Submit transaction to Pi Network
    let submitResponse;
    try {
      submitResponse = await horizonServer.submitTransaction(transaction);
    } catch (submitError) {
      // Extract detailed error information from Horizon response
      const errorCode = submitError?.response?.data?.extras?.result_codes;
      const errorTitle = submitError?.response?.data?.title || "Transaction submission failed";
      const errorMessage = submitError?.response?.data?.extras?.envelope_xdr ? 
        "Transaction was rejected by the network" : submitError.message;

      throw new Error(JSON.stringify({
        title: errorTitle,
        code: errorCode || "UNKNOWN_ERROR",
        message: errorMessage
      }));
    }

    // Success response
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        message: "Transaction submitted successfully",
        result: {
          hash: submitResponse.hash,
          ledger: submitResponse.ledger,
          successful: submitResponse.successful,
          pagingToken: submitResponse.paging_token
        }
      })
    };

  } catch (error) {
    console.error("🔥 submitTransaction error:", error);

    // Parse error details if it's a JSON string (from our custom error above)
    let errorDetails = { error: error.message };
    try {
      if (typeof error.message === "string") {
        const parsed = JSON.parse(error.message);
        errorDetails = parsed;
      }
    } catch (e) {
      // Keep original error message if parsing fails
    }

    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({
        success: false,
        error: "Transaction submission failed",
        details: errorDetails
      })
    };
  }
};
