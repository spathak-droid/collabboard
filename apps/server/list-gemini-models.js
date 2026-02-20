/**
 * List all available Gemini models using REST API
 */

import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.GOOGLE_GEMINI_API_KEY;

if (!apiKey) {
  console.error('❌ GOOGLE_GEMINI_API_KEY not found in .env');
  process.exit(1);
}

console.log('🔍 Fetching available Gemini models...\n');

try {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
  );
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  
  const data = await response.json();
  
  console.log(`✅ Found ${data.models?.length || 0} models:\n`);
  
  for (const model of data.models || []) {
    console.log(`📦 ${model.name}`);
    console.log(`   Display Name: ${model.displayName}`);
    console.log(`   Description: ${model.description || 'N/A'}`);
    console.log(`   Supported Methods: ${model.supportedGenerationMethods?.join(', ') || 'N/A'}`);
    console.log(`   Input Token Limit: ${model.inputTokenLimit || 'N/A'}`);
    console.log(`   Output Token Limit: ${model.outputTokenLimit || 'N/A'}`);
    console.log('');
  }
  
  // Filter models that support generateContent
  const contentModels = (data.models || []).filter(m => 
    m.supportedGenerationMethods?.includes('generateContent')
  );
  
  console.log('\n✨ Models that support generateContent (for AI Assistant):');
  console.log('   (Use these model names in your code)\n');
  contentModels.forEach(m => {
    // Extract just the model ID (e.g., "gemini-pro" from "models/gemini-pro")
    const modelId = m.name.replace('models/', '');
    console.log(`   ✓ ${modelId}`);
  });
  
} catch (error) {
  console.error('❌ Error fetching models:', error.message);
  process.exit(1);
}
