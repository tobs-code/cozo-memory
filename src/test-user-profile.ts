import { MemoryServer } from './index';

async function testUserProfileEditing() {
  console.log("=== Testing User Profile Editing ===\n");
  
  const server = new MemoryServer();
  await server.start();
  
  try {
    // 1. View current profile
    console.log("1. Current user profile:");
    const currentProfile = await server.editUserProfile({});
    console.log(JSON.stringify(currentProfile, null, 2));
    
    // 2. Update metadata
    console.log("\n2. Updating profile metadata:");
    const metadataUpdate = await server.editUserProfile({
      metadata: {
        timezone: "Europe/Berlin",
        language: "de",
        work_hours: "09:00-17:00"
      }
    });
    console.log(JSON.stringify(metadataUpdate, null, 2));
    
    // 3. Add new preferences
    console.log("\n3. Adding new preferences:");
    const addPrefs = await server.editUserProfile({
      observations: [
        { text: "Prefers TypeScript over JavaScript for type safety" },
        { text: "Likes clean, minimal code without unnecessary comments" },
        { text: "Prefers functional programming patterns" }
      ]
    });
    console.log(JSON.stringify(addPrefs, null, 2));
    
    // 4. Clear and reset preferences
    console.log("\n4. Clearing and resetting preferences:");
    const resetPrefs = await server.editUserProfile({
      clear_observations: true,
      observations: [
        { text: "Works primarily with Node.js and TypeScript", metadata: { category: "tech_stack" } },
        { text: "Prefers concise documentation", metadata: { category: "style" } }
      ]
    });
    console.log(JSON.stringify(resetPrefs, null, 2));
    
    // 5. Update name and type
    console.log("\n5. Updating profile name and type:");
    const nameUpdate = await server.editUserProfile({
      name: "Developer Profile",
      type: "UserProfile"
    });
    console.log(JSON.stringify(nameUpdate, null, 2));
    
    console.log("\n=== Test completed successfully ===");
    
  } catch (error) {
    console.error("Test failed:", error);
  } finally {
    process.exit(0);
  }
}

testUserProfileEditing();
