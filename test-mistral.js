const config = require("./src/config");
const { Mistral } = require("@mistralai/mistralai");
const client = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY,
});

async function testMistral() {
  try {
    const chatResponse = await client.chat.complete({
      model: "devstral-medium-latest",
      messages: [{ role: "user", content: "What is the best French cheese?" }],
    });
    console.log(
      "✅ Mistral AI test successful:",
      chatResponse.choices[0].message.content
    );
  } catch (error) {
    console.error("❌ Mistral AI test failed:", error);
  }
}

testMistral();
