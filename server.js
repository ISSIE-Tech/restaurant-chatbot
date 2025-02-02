import * as line from "@line/bot-sdk";
import express from "express";

import * as helper from "./helper.js";

import foodTypes from "./data/foodTypes.json" assert { type: "json" };

// Mock Database
const defaultDb = {
  order: {
    name: null,
    price: null,
    image: null,
    type: null,
  },
  destination: {
    title: null,
    address: null,
  },
  dateTime: {
    date: null,
    time: null,
  },
};

let db = { ...defaultDb };

function resetDb() {
  db = { ...defaultDb };

  console.log("------- db updated -------");
  console.log({ db });
}

function updateOrder(order) {
  db.order = order;

  console.log("------- db updated -------");
  console.log({ db });
}

function updateDestination(destination) {
  db.destination = destination;

  console.log("------- db updated -------");
  console.log({ db });
}

function updateDateTime(dateTime) {
  db.dateTime = dateTime;

  console.log("------- db updated -------");
  console.log({ db });
}

// Configs
const config = {
  channelSecret: "",
};

const client = new line.messagingApi.MessagingApiClient({
  channelAccessToken: "",
});

// Create express application
const app = express();
const port = 3000;
app.listen(port, () => console.log(`Starting application on port: ${port}`));

// register a webhook handler with middleware
app.post("/callback", line.middleware(config), async (req, res) => {
  try {
    const results = await Promise.all(req.body.events.map(handleEvent));
    res.send(results);
  } catch (err) {
    console.error("Error handling events:", err);
    res.status(500).send();
  }
});

async function handleEvent(event) {
  await client.showLoadingAnimation({
    chatId: event.source.userId,
    loadingSeconds: 5,
  });

  if (event.type === "message") {
    switch (event.message.type) {
      case "text":
        handleTextMessage(event);
        break;
      case "location":
        handleLocationMessage(event);
      default:
        return null;
    }
  } else if (event.type === "postback") {
    handlePostback(event);
  }
}

function handleTextMessage(event) {
  if (event.message.text == "START ORDER") return sendFoodTypes(event);

  if (event.message.text === "Cancel Order") return cancelOrder(event);

  if (event.message.text === "Confirm Order") return confirmOrder(event);

  const foodType = event.message.text.match(/^Select (\w+) Food$/);
  if (foodType) return sendMenu(event, foodType[1]);

  const order = event.message.text.match(/^Order\s+(.*)$/);
  if (order) {
    const [foodType, selectedMenu] = helper.getMenuDetailsByMenuName(
      foodTypes,
      order[1]
    );
    updateOrder({
      name: selectedMenu.name,
      price: selectedMenu.price,
      image: selectedMenu.image,
      type: foodType,
    });

    return sendLocation(event);
  }

  return null;
}

function sendFoodTypes(event) {
  const message = { type: "text", text: "Please select the type of food." };
  const carousel = {
    type: "flex",
    altText: "this is a flex message",
    contents: {
      type: "carousel",
      contents: foodTypes.map((type) =>
        helper.generateFoodTypeBubble(type.name, type.image)
      ),
    },
  };

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [message, carousel],
  });
}

function sendMenu(event, menuType) {
  const selectedType = foodTypes.filter((type) => type.name === menuType)[0];

  const message = { type: "text", text: "Please select your dish." };
  const carousel = {
    type: "flex",
    altText: "this is a flex message",
    contents: {
      type: "carousel",
      contents: selectedType.menu.map((type) =>
        helper.generateFoodBubble(type.name, type.image, type.price)
      ),
    },
  };

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [message, carousel],
  });
}

function sendLocation(event) {
  const quickReply = {
    type: "text",
    quickReply: {
      items: [
        {
          type: "action",
          action: {
            type: "location",
            label: "Location",
          },
        },
      ],
    },
    text: "Select Destination",
  };

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [quickReply],
  });
}

function handleLocationMessage(event) {
  updateDestination({
    title: event.message.title,
    address: event.message.address,
  });

  return sendDateTimePicker(event);
}

function sendDateTimePicker(event) {
  const config = helper.getDatePickerConfig();

  const quickReply = {
    type: "text",
    quickReply: {
      items: [
        {
          type: "action",
          action: {
            type: "datetimepicker",
            label: "Select date",
            data: "datetime",
            mode: "datetime",
            initial: config.minDate,
            max: config.maxDate,
            min: config.minDate,
          },
        },
      ],
    },
    text: "Select shipping date",
  };

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [quickReply],
  });
}

function handlePostback(event) {
  const dateString = event.postback.params.datetime;
  const [date, time] = dateString.split("T");
  updateDateTime({ date, time });

  const template = {
    type: "template",
    altText: "this is a confirm template",
    template: {
      type: "confirm",
      text: `Confirm order ${db.order.name} ?`,
      actions: [
        {
          type: "message",
          label: "No",
          text: "Cancel Order",
        },
        {
          type: "message",
          label: "Yes",
          text: "Confirm Order",
        },
      ],
    },
  };

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [template],
  });
}

function confirmOrder(event) {
  if (helper.hasNullFields(db)) {
    const message = {
      type: "text",
      text: "Order step incomplete. Please try again.",
    };

    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [message],
    });
  }

  const bubble = {
    type: "flex",
    altText: "this is a flex message",
    contents: helper.generateReceipt(
      db.order.name,
      db.order.type,
      db.dateTime.date,
      db.dateTime.time,
      db.destination.title ?? "",
      db.destination.address,
      db.order.price
    ),
  };

  const message = {
    type: "text",
    text: "Confirm your order! Enjoy your meal!",
  };

  resetDb();

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [bubble, message],
  });
}

function cancelOrder(event) {
  if (helper.allNullFields(db)) {
    const message = {
      type: "text",
      text: "Can't cancel the order",
    };

    return client.replyMessage({
      replyToken: event.replyToken,
      messages: [message],
    });
  }

  resetDb();

  const message = { type: "text", text: "Cancelled your order" };

  return client.replyMessage({
    replyToken: event.replyToken,
    messages: [message],
  });
}
