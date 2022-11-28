const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const express = require("express");
const cors = require("cors");
const app = express();
const jwt = require("jsonwebtoken");
const port = process.env.PORT || 5000;
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SECRET);

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.t17zvb5.mongodb.net/?retryWrites=true&w=majority`;
// console.log(uri);
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});

function verifyJWT(req, res, next) {
  // console.log("token", req.headers.authorization);
  const authHeader = req.headers.authorization;
  // console.log(authHeader);
  if (!authHeader) {
    return res.status(401).send({ message: "unauthorized access" });
  }
  const token = authHeader.split(" ")[1];
  console.log(token);
  jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
    if (err) {
      return res.status(403).send({ message: "forbidden access" });
    }
    req.decoded = decoded;

    next();
  });
}

async function run() {
  try {
    const phonesStall = client.db("phonesStall");
    const usersCollection = phonesStall.collection("users");
    const phonesCollection = phonesStall.collection("phonesCollection");
    const bookingsCollection = phonesStall.collection("bookings");
    const paymentsCollection = phonesStall.collection("payments");

    app.put("/users", async (req, res) => {
      const user = req.body;
      const filter = {
        email: user.email,
      };
      const options = { upsert: true };

      const updatedDoc = {
        $set: {
          name: user.name,
          email: user.email,
          role: user.role,
        },
      };
      const result = await usersCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(result);
    });

    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = { email };

      const user = await usersCollection.findOne(query);

      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
          expiresIn: "1d",
        });
        return res.send({ accessToken: token });
      }
      // console.log(user);
      res.status(403).send({ accessToken: "" });
    });

    app.get("/users", async (req, res) => {
      const email = req.query.email;

      let query = {};

      if (email) {
        query = {
          email: email,
        };
      }
      const result = await usersCollection.find(query).toArray();
      res.send(result);
    });

    app.put("/users/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      // const result = await usersCollection.findOne(query)
      const updatedDoc = {
        $set: {
          status: "verified",
        },
      };
      const result = await usersCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(result);
    });
    // phhone query
    app.get("/phones", async (req, res) => {
      const query = {};
      const result = await phonesCollection.find(query).toArray();
      res.send(result);
    });
    app.get("/brands", async (req, res) => {
      const brands = await phonesCollection.distinct("brand");
      res.send(brands);
    });

    app.get("/phones/:brand", async (req, res) => {
      const brand = req.params.brand;
      const query = {
        brand: brand,
        $and: [
          {
            sold: { $ne: true },
          },
        ],
      };
      const phones = await phonesCollection.find(query).toArray();

      res.send(phones);
    });
    app.post("/payments", async (req, res) => {
      const payment = req.body;
      const result = await paymentsCollection.insertOne(payment);
      const id = payment.bookingId;
      const filter = { _id: ObjectId(id) };
      const updatedDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };
      const updateResult = await bookingsCollection.updateOne(
        filter,
        updatedDoc
      );
      const productId = payment.productId;
      const productFilter = {
        _id: ObjectId(productId),
      };
      const productUpdatedDoc = {
        $set: {
          sold: true,
        },
      };
      const updateProductStatus = await phonesCollection.updateOne(
        productFilter,
        productUpdatedDoc
      );
      // const updateproduct = await phonesCollection.updateOne(
      //   filter,
      //   updatedDoc
      // );
      res.send(result);
    });
    app.post("/phones", async (req, res) => {
      const product = req.body;
      const result = await phonesCollection.insertOne(product);
      res.send(result);
    });
    app.post("/bookings", async (req, res) => {
      const bookings = req.body;
      const result = await bookingsCollection.insertOne(bookings);
      res.send(result);
    });
    // verify role
    app.get("/users/role/:email", async (req, res) => {
      const email = req.params.email;
      const query = {
        email: email,
      };
      const result = await usersCollection.findOne(query);
      res.send(result);
    });
    app.get("/orders", async (req, res) => {
      const query = {};

      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
    });
    app.get("/orders/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await bookingsCollection.findOne(query);
      res.send(result);
    });

    //my orders
    app.get("/myorders/:email", async (req, res) => {
      const email = req.params.email;
      const decodedEmail = req.decoded.email;
      if (email !== decodedEmail) {
        return res.status(403).send({ message: "forbidden access" });
      }

      const query = {
        email: email,
      };

      const result = await bookingsCollection.find(query).toArray();
      res.send(result);
      //my products

      // app.get("/phones", async (req, res) => {
      //   const query = {};
      //   const result = await phonesCollection.find(query).toArray();
      //   res.send(result);
      // });
    });

    app.get("/myproducts/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const result = await phonesCollection.find(query).toArray();
      res.send(result);
    });

    ///Payment
    app.post("/create-payment-intent", async (req, res) => {
      const order = req.body;
      const price = order.price;
      const amount = price * 100;
      const paymentintent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });
      res.send({
        clientSecret: paymentintent.client_secret,
      });
    });

    app.get("/allsellers", async (req, res) => {
      const filter = { role: { $in: ["seller"] } };
      const cursor = usersCollection.find(filter);
      const result = await cursor.toArray();
      res.send(result);
    });
    app.get("/reporteditem", async (req, res) => {
      const filter = { reported: { $in: [true] } };
      const cursor = phonesCollection.find(filter);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.get("/allbuyers", async (req, res) => {
      const filter = { role: { $in: ["buyer"] } };
      const cursor = usersCollection.find(filter);
      const result = await cursor.toArray();
      res.send(result);
    });

    app.delete("/user/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });
    app.delete("/reporteditem/:id", verifyJWT, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await phonesCollection.deleteOne(query);
      res.send(result);
    });
    app.delete("/product/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await phonesCollection.deleteOne(query);
      res.send(result);
    });
    app.put("/product/reported/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updatedDoc = {
        $set: {
          reported: true,
        },
      };
      const result = await phonesCollection.updateOne(
        filter,
        updatedDoc,
        options
      );
      res.send(result);
    });

    //put addvertise set

    app.put("/advertise/:id", async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          advertise: true,
        },
      };
      const result = await phonesCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });

    app.get("/advertisedproducts", async (req, res) => {
      const query = {
        advertise: true,
        $and: [
          {
            sold: { $ne: true },
          },
        ],
      };
      const result = await phonesCollection.find(query).toArray();
      res.send(result);
    });

    app.delete("/user/:id", async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await usersCollection.deleteOne(query);
      res.send(result);
    });
  } finally {
  }
}
run().catch((err) => console.log(err));

app.get("/", (req, res) => {
  res.send("server is running");
});

app.listen(port, () => {
  console.log(port, "sserrrr");
});
