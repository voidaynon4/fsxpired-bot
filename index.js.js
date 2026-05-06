const {
  Client,
  GatewayIntentBits,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  InteractionType
} = require("discord.js");

const { QuickDB } = require("quick.db");
const db = new QuickDB();

// Web dashboard deps
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

// Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ]
});

// ====== ECONOMY CONFIG ======
const allowedRoles = [
  "1500571064890298369",
  "1500570969935446247",
  "1500769593625411716"
];

const DOUBLE_COINS_ROLE_ID = "1501545474006585536";
const STAFF_CHANNEL_ID = "1501552081696194581";
const HOST_ROLE_ID = "1500769593625411716";

// Leaderboard channel
const LEADERBOARD_CHANNEL_ID = "1499667962469290095";
let leaderboardMessageId = null;

// ====== WEB DASHBOARD SETUP ======
const app = express();
const webServer = http.createServer(app);
const io = new Server(webServer, {
  cors: { origin: "*" }
});

app.use(express.json());

// Simple HTML dashboard
app.get("/", (req, res) => {
  res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>Fs Xpired • Economy Dashboard</title>
  <style>
    body { background:#0f1012; color:#fff; font-family:Arial, sans-serif; margin:0; padding:20px; }
    h1 { color:#ff2d2d; }
    table { width:100%; border-collapse:collapse; margin-top:20px; }
    th, td { padding:10px; border-bottom:1px solid #333; text-align:left; }
    th { background:#1e1f22; }
    tr:nth-child(even) { background:#151619; }
    .rank { width:60px; }
  </style>
</head>
<body>
  <h1>🏆 Fs Xpired • Live Coin Leaderboard</h1>
  <p>Updates in real time as players earn or spend coins.</p>
  <table>
    <thead>
      <tr>
        <th class="rank">#</th>
        <th>Player ID</th>
        <th>Coins</th>
      </tr>
    </thead>
    <tbody id="tbody"></tbody>
  </table>

  <script src="https://cdn.socket.io/4.7.2/socket.io.min.js"></script>
  <script>
    const tbody = document.getElementById("tbody");
    const socket = io();

    function render(lb) {
      tbody.innerHTML = "";
      lb.forEach((u, i) => {
        const tr = document.createElement("tr");
        tr.innerHTML = \`
          <td>\${i + 1}</td>
          <td>\${u.userId}</td>
          <td>\${u.coins}</td>
        \`;
        tbody.appendChild(tr);
      });
    }

    fetch("/api/leaderboard")
      .then(r => r.json())
      .then(render)
      .catch(console.error);

    socket.on("leaderboardUpdate", render);
  </script>
</body>
</html>
  `);
});

// API: leaderboard JSON
app.get("/api/leaderboard", async (req, res) => {
  try {
    const lb = await getSortedCoins();
    res.json(lb.slice(0, 20));
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Failed to load leaderboard" });
  }
});

// Start web server
webServer.listen(3000, () => {
  console.log("🌐 Dashboard running at http://localhost:3000");
});

// ====== SHOP ITEMS ======
const shopItems = [
  {
    id: "top5",
    name: "Top 5 Immunity",
    price: 3,
    description: "Get immunity until Top 5. Use any time.",
    emoji: "🛡️"
  },
  {
    id: "host1",
    name: "Host 1 Game With Host",
    price: 5,
    description: "Play 1 full game hosted by the server host.",
    emoji: "🎮"
  },
  {
    id: "timeout1",
    name: "Time Out a Player (1 Day)",
    price: 25,
    description: "Prevent a player from earning coins for 24 hours.",
    emoji: "⏳"
  },
  {
    id: "skin1k",
    name: "Pick a Skin (800–1000 V‑Bucks)",
    price: 50,
    description: "Choose any skin worth 800–1000 V‑Bucks to be gifted.",
    emoji: "🎁"
  },
  {
    id: "ban2w",
    name: "Ban From Earning Coins (2 Weeks)",
    price: 75,
    description: "Ban a player from earning coins or items for 14 days.",
    emoji: "🔨"
  },
  {
    id: "vb2000",
    name: "2000 V‑Bucks",
    price: 95,
    description: "Get 2000 V‑Bucks to spend on anything you want.",
    emoji: "💸"
  },
  {
    id: "gift2k",
    name: "Gift Anything Worth 2000 V‑Bucks",
    price: 110,
    description: "Choose any item worth 2000 V‑Bucks to be gifted.",
    emoji: "🎁"
  },
  {
    id: "double24",
    name: "Double Coins (24 Hours)",
    price: 150,
    description: "Double your coin earnings for 24 hours.",
    emoji: "⚡"
  }
];

// CRATES
const crates = [
  {
    id: "crate10",
    name: "10 Coin Crate",
    price: 10,
    emoji: "🎁",
    rewards: ["top5", "host1", "timeout1"]
  },
  {
    id: "crate100",
    name: "100 Coin Crate",
    price: 100,
    emoji: "🎁",
    rewards: ["skin1k", "ban2w", "vb2000"]
  },
  {
    id: "crate120",
    name: "120 Coin Crate",
    price: 120,
    emoji: "🎁",
    rewards: ["gift2k", "double24"]
  }
];

// ====== LEADERBOARD HELPERS ======
async function getSortedCoins() {
  const all = await db.all();
  return all
    .filter(e => e.id.startsWith("coins_"))
    .map(e => ({
      userId: e.id.replace("coins_", ""),
      coins: e.value
    }))
    .sort((a, b) => b.coins - a.coins);
}

async function updateLeaderboard(client) {
  try {
    const channel = await client.channels.fetch(LEADERBOARD_CHANNEL_ID);
    if (!channel) return;

    const coins = await getSortedCoins();
    const top10 = coins.slice(0, 10);

    let description = top10
      .map((u, i) => `**${i + 1}.** <@${u.userId}> — **${u.coins} coins**`)
      .join("\n");

    if (!description) description = "No players have coins yet.";

    const embed = new EmbedBuilder()
      .setTitle("🏆 Live Coin Leaderboard")
      .setColor("#ff2d2d")
      .setDescription(description)
      .setFooter({ text: "Updates automatically" });

    if (leaderboardMessageId) {
      try {
        const msg = await channel.messages.fetch(leaderboardMessageId);
        await msg.edit({ embeds: [embed] });
      } catch {
        const newMsg = await channel.send({ embeds: [embed] });
        leaderboardMessageId = newMsg.id;
      }
    } else {
      const newMsg = await channel.send({ embeds: [embed] });
      leaderboardMessageId = newMsg.id;
    }

    // Also push to web dashboard
    io.emit("leaderboardUpdate", coins.slice(0, 20));
  } catch (e) {
    console.log("Failed to update leaderboard:", e);
  }
}

async function handleLeaderboardMovement(userId, beforeList, client) {
  try {
    const oldRank = beforeList.findIndex(u => u.userId === userId);
    const afterList = await getSortedCoins();
    const newRank = afterList.findIndex(u => u.userId === userId);

    if (oldRank === -1 || newRank === -1) return;
    if (newRank >= oldRank) return; // only care if they moved up

    const user = await client.users.fetch(userId);
    const newCoins = afterList[newRank].coins;

    // DM to player who moved up
    await user.send(
      `🎉 You moved up on the leaderboard!\nYou are now **#${newRank + 1}** with **${newCoins} coins**.`
    ).catch(() => {});

    // DM to overtaken player
    const overtaken = afterList[newRank + 1];
    if (overtaken && overtaken.userId !== userId) {
      const overtakenUser = await client.users.fetch(overtaken.userId);
      await overtakenUser.send(
        `⚠️ Someone just passed you on the leaderboard!\nYou are now **#${newRank + 2}**.`
      ).catch(() => {});
    }
  } catch (e) {
    console.log("Failed to handle leaderboard movement:", e);
  }
}

// ====== INVENTORY HELPERS ======
async function getInventory(userId) {
  return (await db.get(`inventory_${userId}`)) || [];
}

async function addItemToInventory(userId, itemId) {
  const inv = await getInventory(userId);
  inv.push(itemId);
  await db.set(`inventory_${userId}`, inv);
}

async function removeOneItemFromInventory(userId, itemId) {
  const inv = await getInventory(userId);
  const index = inv.indexOf(itemId);
  if (index !== -1) {
    inv.splice(index, 1);
    await db.set(`inventory_${userId}`, inv);
  }
}

function formatInventory(inv) {
  if (!inv.length) return "You don't own any items yet.";
  const counts = {};
  for (const id of inv) counts[id] = (counts[id] || 0) + 1;
  return Object.entries(counts)
    .map(([id, count]) => {
      const item = shopItems.find(i => i.id === id);
      const name = item ? item.name : id;
      return `• **${name}** x${count}`;
    })
    .join("\n");
}

// Double coins role
async function giveDoubleCoinsRole(member) {
  try {
    await member.roles.add(DOUBLE_COINS_ROLE_ID);
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    await db.set(`doublecoins_${member.id}`, expiresAt);

    setTimeout(async () => {
      const stored = await db.get(`doublecoins_${member.id}`);
      if (!stored) return;
      if (Date.now() >= stored) {
        try {
          await member.roles.remove(DOUBLE_COINS_ROLE_ID);
        } catch (e) {
          console.log("Failed to remove double coins role:", e);
        }
        await db.delete(`doublecoins_${member.id}`);
      }
    }, 24 * 60 * 60 * 1000);
  } catch (e) {
    console.log("Failed to give double coins role:", e);
  }
}

// Staff message helper
async function sendStaffRedeemEmbed(guild, user, itemName, extraText = "") {
  const channel = guild.channels.cache.get(STAFF_CHANNEL_ID);
  if (!channel) return;
  const embed = new EmbedBuilder()
    .setColor("#ff2d2d")
    .setTitle("🎉 Item Redeemed!")
    .setDescription(
      `Player: ${user}\n` +
      `Reward: **${itemName}**\n\n` +
      "Staff, please take action.\n" +
      (extraText ? `\n${extraText}` : "")
    )
    .setFooter({ text: "Economy System • Fs Xpired" });
  await channel.send({ embeds: [embed] });
}

// ====== READY ======
client.on("ready", async () => {
  console.log(`Logged in as ${client.user.tag}`);

  const channel = client.channels.cache.get("1499667226586775612");
  if (!channel) return console.log("❌ Channel not found.");

  const embed = new EmbedBuilder()
    .setColor("#ff2d2d")
    .setTitle("🎉 Daily Rewards & Shop")
    .setDescription(
      "**Economy System • Fs Xpired**\n" +
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
      "Claim your daily coins, check your balance, open crates, use items, or buy from the shop.\n\n" +
      "Stay active every day to build your streak and earn more."
    )
    .setFooter({ text: "Economy System • Fs Xpired" });

  const menu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("main_menu")
      .setPlaceholder("Choose an option...")
      .addOptions([
        {
          label: "Claim Daily",
          value: "daily",
          emoji: "🎁"
        },
        {
          label: "Check Balance",
          value: "balance",
          emoji: "💰"
        },
        {
          label: "Open Shop",
          value: "shop",
          emoji: "🛒"
        },
        {
          label: "Use Item",
          value: "useitem",
          emoji: "🎒"
        },
        {
          label: "Add Coins (Staff)",
          value: "addcoins",
          emoji: "➕"
        },
        {
          label: "Remove Coins (Staff)",
          value: "removecoins",
          emoji: "➖"
        }
      ])
  );

  await channel.send({ embeds: [embed], components: [menu] });

  // Initial leaderboard build
  await updateLeaderboard(client);
});

// ====== INTERACTIONS ======
client.on("interactionCreate", async interaction => {
  // MAIN MENU
  if (interaction.isStringSelectMenu() && interaction.customId === "main_menu") {
    const userId = interaction.user.id;
    const choice = interaction.values[0];

    // DAILY CLAIM
    if (choice === "daily") {
      const now = Date.now();
      const cooldown = 24 * 60 * 60 * 1000;
      const last = await db.get(`daily_${userId}`);

      if (last && now - last < cooldown) {
        return interaction.reply({
          content: "⏳ You already claimed your daily reward.",
          ephemeral: true
        });
      }

      let reward = 20;
      try {
        const member = await interaction.guild.members.fetch(userId);
        if (member.roles.cache.has(DOUBLE_COINS_ROLE_ID)) {
          reward *= 2;
        }
      } catch (e) {
        console.log("Failed to fetch member for daily:", e);
      }

      const beforeList = await getSortedCoins();

      await db.set(`daily_${userId}`, now);
      await db.add(`coins_${userId}`, reward);

      await handleLeaderboardMovement(userId, beforeList, client);
      await updateLeaderboard(client);

      return interaction.reply({
        content: `🎉 You claimed **${reward} coins**!`,
        ephemeral: true
      });
    }

    // BALANCE
    if (choice === "balance") {
      const coins = (await db.get(`coins_${userId}`)) || 0;
      const inv = await getInventory(userId);

      const balanceEmbed = new EmbedBuilder()
        .setColor("#1e1f22")
        .setTitle("💰 Your Balance")
        .setDescription(`You currently have **${coins} coins**`)
        .addFields({
          name: "🎒 Inventory",
          value: formatInventory(inv)
        })
        .setFooter({ text: "Economy System • Fs Xpired" });

      return interaction.reply({
        embeds: [balanceEmbed],
        ephemeral: true
      });
    }

    // SHOP VIEW
    if (choice === "shop") {
      const shopEmbed = new EmbedBuilder()
        .setColor("#ff2d2d")
        .setTitle("🛒 Shop")
        .setDescription(
          "**Items:**\n\n" +
            shopItems
              .map(
                item =>
                  `${item.emoji} **${item.name}** — **${item.price} coins**\n${item.description}`
              )
              .join("\n\n") +
            "\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n" +
            "**Crates:**\n\n" +
            crates
              .map(
                c =>
                  `${c.emoji} **${c.name}** — **${c.price} coins**`
              )
              .join("\n")
        )
        .setFooter({ text: "Select an item or crate below." });

      const shopMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("shop_menu")
          .setPlaceholder("Select an item to buy...")
          .addOptions(
            shopItems.map(item => ({
              label: item.name,
              value: item.id,
              description: `Cost: ${item.price} coins`,
              emoji: item.emoji
            }))
          )
      );

      const crateMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("crate_menu")
          .setPlaceholder("Select a crate to open...")
          .addOptions(
            crates.map(c => ({
              label: c.name,
              value: c.id,
              description: `Cost: ${c.price} coins`,
              emoji: c.emoji
            }))
          )
      );

      return interaction.reply({
        embeds: [shopEmbed],
        components: [shopMenu, crateMenu],
        ephemeral: true
      });
    }

    // USE ITEM
    if (choice === "useitem") {
      const inv = await getInventory(userId);
      const uniqueIds = [...new Set(inv)].filter(id => id !== "double24");
      if (!uniqueIds.length) {
        return interaction.reply({
          content: "🎒 You don't have any usable items.",
          ephemeral: true
        });
      }

      const options = uniqueIds
        .map(id => {
          const item = shopItems.find(i => i.id === id);
          if (!item) return null;
          return {
            label: item.name,
            value: item.id,
            description: "Use this item",
            emoji: item.emoji
          };
        })
        .filter(Boolean);

      if (!options.length) {
        return interaction.reply({
          content: "🎒 You don't have any usable items.",
          ephemeral: true
        });
      }

      const useMenu = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
          .setCustomId("useitem_menu")
          .setPlaceholder("Select an item to use...")
          .addOptions(options)
      );

      const useEmbed = new EmbedBuilder()
        .setColor("#ff2d2d")
        .setTitle("🎒 Use Item")
        .setDescription("Select an item from the dropdown below to use it.")
        .setFooter({ text: "Economy System • Fs Xpired" });

      return interaction.reply({
        embeds: [useEmbed],
        components: [useMenu],
        ephemeral: true
      });
    }

    // STAFF: ADD / REMOVE COINS
    if (choice === "addcoins" || choice === "removecoins") {
      const isOwner = interaction.guild.ownerId === interaction.user.id;
      const hasRole = interaction.member.roles.cache.some(r =>
        allowedRoles.includes(r.id)
      );

      if (!isOwner && !hasRole) {
        const noPermEmbed = new EmbedBuilder()
          .setColor("#ff2d2d")
          .setTitle("❌ Access Denied")
          .setDescription("You do not have permission to use this feature.")
          .setFooter({ text: "Economy System • Fs Xpired" });

        return interaction.reply({
          embeds: [noPermEmbed],
          ephemeral: true
        });
      }

      const modal = new ModalBuilder()
        .setCustomId(choice === "addcoins" ? "addcoins_modal" : "removecoins_modal")
        .setTitle(choice === "addcoins" ? "Add Coins" : "Remove Coins");

      const userInput = new TextInputBuilder()
        .setCustomId("target_user")
        .setLabel("User ID or @mention")
        .setStyle(TextInputStyle.Short);

      const amountInput = new TextInputBuilder()
        .setCustomId("amount")
        .setLabel("Amount of coins")
        .setStyle(TextInputStyle.Short);

      modal.addComponents(
        new ActionRowBuilder().addComponents(userInput),
        new ActionRowBuilder().addComponents(amountInput)
      );

      return interaction.showModal(modal);
    }
  }

  // SHOP BUY HANDLER
  if (interaction.isStringSelectMenu() && interaction.customId === "shop_menu") {
    const userId = interaction.user.id;
    const itemId = interaction.values[0];
    const item = shopItems.find(i => i.id === itemId);

    if (!item) {
      return interaction.reply({
        content: "❌ Item not found.",
        ephemeral: true
      });
    }

    const inv = await getInventory(userId);
    if (item.id !== "double24" && inv.includes(item.id)) {
      return interaction.reply({
        content: `❌ You already own **${item.name}**. Use it before buying again.`,
        ephemeral: true
      });
    }

    const coins = (await db.get(`coins_${userId}`)) || 0;
    if (coins < item.price) {
      return interaction.reply({
        content: `❌ You need **${item.price} coins** to buy **${item.name}**.`,
        ephemeral: true
      });
    }

    const beforeList = await getSortedCoins();

    await db.add(`coins_${userId}`, -item.price);

    if (item.id === "double24") {
      try {
        const member = await interaction.guild.members.fetch(userId);
        await giveDoubleCoinsRole(member);
      } catch (e) {
        console.log("Failed to give double coins role from shop:", e);
      }
    } else {
      await addItemToInventory(userId, item.id);
    }

    await handleLeaderboardMovement(userId, beforeList, client);
    await updateLeaderboard(client);

    const buyEmbed = new EmbedBuilder()
      .setColor("#00c853")
      .setTitle("✅ Purchase Successful")
      .setDescription(
        `You bought **${item.name}** for **${item.price} coins**.\n\n${item.description}`
      )
      .setFooter({ text: "Economy System • Fs Xpired" });

    return interaction.reply({
      embeds: [buyEmbed],
      ephemeral: true
    });
  }

  // CRATE OPEN HANDLER
  if (interaction.isStringSelectMenu() && interaction.customId === "crate_menu") {
    const userId = interaction.user.id;
    const crateId = interaction.values[0];
    const crate = crates.find(c => c.id === crateId);

    if (!crate) {
      return interaction.reply({
        content: "❌ Crate not found.",
        ephemeral: true
      });
    }

    const coins = (await db.get(`coins_${userId}`)) || 0;
    if (coins < crate.price) {
      return interaction.reply({
        content: `❌ You need **${crate.price} coins** to open **${crate.name}**.`,
        ephemeral: true
      });
    }

    const beforeList = await getSortedCoins();

    await db.add(`coins_${userId}`, -crate.price);

    const rewardId =
      crate.rewards[Math.floor(Math.random() * crate.rewards.length)];
    const rewardItem = shopItems.find(i => i.id === rewardId);

    if (rewardId === "double24") {
      try {
        const member = await interaction.guild.members.fetch(userId);
        await giveDoubleCoinsRole(member);
      } catch (e) {
        console.log("Failed to give double coins role from crate:", e);
      }
    } else {
      await addItemToInventory(userId, rewardId);
    }

    await handleLeaderboardMovement(userId, beforeList, client);
    await updateLeaderboard(client);

    const rewardName = rewardItem ? rewardItem.name : rewardId;

    const crateEmbed = new EmbedBuilder()
      .setColor("#ff2d2d")
      .setTitle(`${crate.emoji} ${crate.name}`)
      .setDescription(
        `You spent **${crate.price} coins** and received:\n\n🎁 **${rewardName}**`
      )
      .setFooter({ text: "Economy System • Fs Xpired" });

    return interaction.reply({
      embeds: [crateEmbed],
      ephemeral: true
    });
  }

  // USE ITEM HANDLER
  if (interaction.isStringSelectMenu() && interaction.customId === "useitem_menu") {
    const userId = interaction.user.id;
    const itemId = interaction.values[0];
    const item = shopItems.find(i => i.id === itemId);

    if (!item) {
      return interaction.reply({
        content: "❌ Item not found.",
        ephemeral: true
      });
    }

    const inv = await getInventory(userId);
    if (!inv.includes(itemId)) {
      return interaction.reply({
        content: "❌ You don't own this item anymore.",
        ephemeral: true
      });
    }

    if (itemId === "timeout1" || itemId === "ban2w") {
      const modal = new ModalBuilder()
        .setCustomId(itemId === "timeout1" ? "use_timeout_modal" : "use_ban_modal")
        .setTitle(itemId === "timeout1" ? "Use: Timeout Player" : "Use: Ban From Coins");

      const userInput = new TextInputBuilder()
        .setCustomId("target_user")
        .setLabel("User ID or @mention")
        .setStyle(TextInputStyle.Short);

      const reasonInput = new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("Reason / Notes")
        .setStyle(TextInputStyle.Paragraph);

      modal.addComponents(
        new ActionRowBuilder().addComponents(userInput),
        new ActionRowBuilder().addComponents(reasonInput)
      );

      await removeOneItemFromInventory(userId, itemId);

      return interaction.showModal(modal);
    }

    if (itemId === "double24") {
      return interaction.reply({
        content: "⚡ Double Coins is applied automatically when you get it.",
        ephemeral: true
      });
    }

    await removeOneItemFromInventory(userId, itemId);

    if (itemId === "host1") {
      const extra = `<@&${HOST_ROLE_ID}> please run a match!`;
      await sendStaffRedeemEmbed(
        interaction.guild,
        interaction.user.toString(),
        item.name,
        extra
      );
    } else {
      await sendStaffRedeemEmbed(
        interaction.guild,
        interaction.user.toString(),
        item.name
      );
    }

    return interaction.reply({
      content: `🎉 You used **${item.name}**! Staff has been notified.`,
      ephemeral: true
    });
  }

  // MODALS
  if (interaction.type === InteractionType.ModalSubmit) {
    const id = interaction.customId;

    // Add / Remove coins
    if (id === "addcoins_modal" || id === "removecoins_modal") {
      const target = interaction.fields.getTextInputValue("target_user");
      const amount = parseInt(interaction.fields.getTextInputValue("amount"));

      if (isNaN(amount) || amount <= 0) {
        return interaction.reply({
          content: "❌ Invalid amount.",
          ephemeral: true
        });
      }

      const targetId = target.replace(/[<@!>]/g, "");
      const key = `coins_${targetId}`;

      const beforeList = await getSortedCoins();

      if (id === "addcoins_modal") {
        await db.add(key, amount);

        await handleLeaderboardMovement(targetId, beforeList, client);
        await updateLeaderboard(client);

        const embed = new EmbedBuilder()
          .setColor("#00c853")
          .setTitle("✅ Coins Added")
          .setDescription(`Added **${amount} coins** to <@${targetId}>`)
          .setFooter({ text: "Economy System • Fs Xpired" });

        return interaction.reply({
          embeds: [embed],
          ephemeral: true
        });
      }

      if (id === "removecoins_modal") {
        const current = (await db.get(key)) || 0;
        const newAmount = Math.max(current - amount, 0);
        await db.set(key, newAmount);

        await handleLeaderboardMovement(targetId, beforeList, client);
        await updateLeaderboard(client);

        const embed = new EmbedBuilder()
          .setColor("#ff2d2d")
          .setTitle("✅ Coins Removed")
          .setDescription(
            `Removed **${amount} coins** from <@${targetId}>.\n` +
            `New balance: **${newAmount} coins**`
          )
          .setFooter({ text: "Economy System • Fs Xpired" });

        return interaction.reply({
          embeds: [embed],
          ephemeral: true
        });
      }
    }

    // Use Timeout / Ban items
    if (id === "use_timeout_modal" || id === "use_ban_modal") {
      const target = interaction.fields.getTextInputValue("target_user");
      const reason = interaction.fields.getTextInputValue("reason");
      const targetId = target.replace(/[<@!>]/g, "");

      const itemName =
        id === "use_timeout_modal"
          ? "Time Out a Player (1 Day)"
          : "Ban From Earning Coins (2 Weeks)";

      const extra =
        id === "use_timeout_modal"
          ? `⏳ Timeout target: <@${targetId}>\nReason: ${reason}`
          : `🔨 Ban From Coins target: <@${targetId}>\nReason: ${reason}`;

      await sendStaffRedeemEmbed(
        interaction.guild,
        interaction.user.toString(),
        itemName,
        extra
      );

      return interaction.reply({
        content: `🎉 You used **${itemName}** on <@${targetId}>. Staff has been notified.`,
        ephemeral: true
      });
    }
  }
});

// ====== LOGIN ======
client.login("MTUwMTQwODM4Mzc5Njc3Mjk2NQ.GN1HiR.qTmSTJzDG7m28ivHSYjK9x49U3zgP3Z__rbuqk");
