const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const path = require('path')
const fs = require('fs');
const util = require('util');
const { pipeline } = require('stream');
const pump = util.promisify(pipeline);
const mime = require('mime');
const fuelTypes = require('./shared/fuelTypes');
const transmissionTypes = require('./shared/transmissionTypes');

// models
const { getCarActionByVinSchema } = require('./fastify-models/car-action');

const {
  generateTokenSchema,
  validateTokenSchema,
  refreshTokenSchema,
  UserLoginSchema,
  UserSignupSchema,
  UserSchema,
  getUserSchema,
} = require('./fastify-models/models');

const {
  getCarSchema,
  getAllCarsSchema,
  createCarSchema,
  updateCarSchema,
  deleteCarSchema,
  getAllOwnerCarsSchema,
} = require('./fastify-models/car-model');

const {
  CarCheckSchema,
  getAllCarCheckSchema,
  getCarCheckSchema,
  updateCarCheckSchema,
  createCarCheckSchema,
  deleteCarCheckSchema,
} = require('./fastify-models/car-check-model');

const CarModel = require('./models/car');
const CarCheckModel = require('./models/car-check');
const UserModel = require('./models/user');
const makeFilters = require('./shared/helpers/makeFilters');
const BrandModel = require('./models/brand-model');
const CarActionModel = require('./models/car-action-model');

const connectionString = 'mongodb://127.0.0.1:27017/vroomvroom';

mongoose
  .connect(connectionString)
  .then(() => {
    console.log('Connected to MongoDB');
  })
  .catch((error) => {
    console.error('Error connecting to MongoDB:', error);
  });

const start = async () => {
  const fastify = require('fastify')();

  fastify.register(require('@fastify/multipart'));

  fastify.register(require('@fastify/jwt'), {
    secret: 'mysecret',
  });

  fastify.register(require('@fastify/cors'));

  fastify.register(require('@fastify/static'), {
    root: path.join(__dirname, './uploads'),
  })

  await fastify.register(require('@fastify/swagger'), {
    exposeRoute: true,
    exposeHeadRoute: false,
    swagger: {
      securityDefinitions: {
        bearerAuth: {
          type: 'apiKey',
          name: 'Authorization',
          in: 'header',
        },
      },
    },
  });

  fastify.register(require('@fastify/swagger-ui'), {});

  fastify.decorate('authenticate', async function (req, reply) {
    try {
      await req.jwtVerify();
    } catch (error) {
      reply.send(error);
    }
  });

  fastify.get('/car-actions/:vin', { schema: getCarActionByVinSchema }, async (req, reply) => {
    const VIN = req.params.vin;

    try {
      const carActions = await CarActionModel.find({ VIN: VIN });

      if (carActions.length === 0) {
        return reply.send([]);
      }

      return reply.send(carActions);
    } catch (error) {
      console.error(error);
      return reply.status(500).send({ message: 'Internal Server Error' });
    }
  });

  fastify.get(
    '/cars',
    {
      schema: getAllCarsSchema,
    },
    (req, reply) => {
      const query = makeFilters(req.query);
      query.isAvtovukypSale = false;

      CarModel.find(query)
        .lean()
        .select(
          'id ownerId carPicsPath brand model price volume transmission color year town odometr vincode plates description comments isAvtovukypSale datePublication fuel'
        )
        .then((result) => {
          reply.send(result);
        })
        .catch((error) => {
          reply.send(error);
        });
    }
  );

  fastify.get(
    '/cars-avtovukyp',
    {
      schema: getAllCarsSchema,
    },
    async (req, reply) => {
      try {
        const cars = await CarModel.find({ isAvtovukypSale: true })
          .lean()
          .select(
            'id ownerId carPicsPath brand model price volume transmission color year town odometr vincode plates description comments isAvtovukypSale datePublication fuel'
          );

        reply.send(cars);
      } catch (error) {
        console.error(error);
        reply.status(500).send({ message: 'Internal Server Error' });
      }
    }
  );

  fastify.get(
    '/my-cars/:ownerId',
    {
      schema: getAllOwnerCarsSchema,
    },
    (req, reply) => {
      const ownerId = req.params.ownerId;
      CarModel.find({ownerId})
        .lean()
        .select(
          'id ownerId carPicsPath brand model price volume transmission color year town odometr vincode plates description comments isAvtovukypSale datePublication'
        )
        .then((result) => {
          reply.send(result);
        })
        .catch((error) => {
          reply.send(error);
        });
    }
  );

  fastify.get(
    '/models/:brand',
    (req, reply) => {
      const brand = req.params.brand;

      BrandModel.findOne({ brand: brand })
        .lean()
        .select(
          'models'
        )
        .then((result) => {
          reply.send(result);
        })
        .catch((err) => {
          return err;
        });
    }
  );

  fastify.get(
    '/car/:id',
    {
      schema: getCarSchema,
    },
    (req, reply) => {
      const id = req.params.id;

      CarModel.findOne({ _id: id })
        .lean()
        .select(
          'ownerId carPicsPath brand model price volume transmission color year town odometr vincode plates description comments isAvtovukypSale datePublication'
        )
        .then((result) => {
          reply.send(result);
        })
        .catch((err) => {
          return err;
        });
    }
  );

  fastify.post(
    '/create-car',
    {
      schema: createCarSchema,
    },
    (req, reply) => {
      const {
        ownerId,
        brand,
        model,
        price,
        volume,
        transmission,
        color,
        year,
        town,
        fuel,
        odometr,
        vincode,
        plates,
        description,
        isAvtovukypSale,
      } = req.body;

      const car = new CarModel({
        ownerId,
        carPicsPath: [],
        brand,
        model,
        price: parseInt(price),
        volume: Number(parseFloat(volume).toFixed(1)),
        transmission,
        color,
        year: parseInt(year),
        town,
        fuel,
        odometr: parseInt(odometr),
        vincode,
        plates,
        description,
        comments: [],
        isAvtovukypSale,
        datePublication: new Date(),
      });

      car
        .save()
        .then(() => {
          console.log(car.plates + ' save to collection');
        })
        .catch((error) => {
          return console.error(error);
        });
      reply.code(201).send(car);
    }
  );

  fastify.put(
    '/car-comment/:id',
    async (req, reply) => {
      const id = req.params.id;
      console.log(req.body);
      const comment = req.body.comment;

      try {
        const car = await CarModel.findOneAndUpdate(
          { _id: id },
          { $push: { comments: comment } },
          { new: true }
        );

        if (!car) {
          return reply.status(404).send({ message: 'Car not found' });
        }

        return reply.send(car);
      } catch (error) {
        console.error(error);
        return reply.status(500).send({ message: 'Internal Server Error' });
      }
    }
  );

  fastify.put(
    '/car-update/:id',
    { schema: updateCarSchema },
    async (req, reply) => {
      const id = req.params.id;
      console.log(req.body.payload);
      const {
        carPicsPath,
        brand,
        model,
        price,
        volume,
        transmission,
        color,
        year,
        odometr,
        vincode,
        plates,
        description,
      } = req.body.payload;

      try {
        const car = await CarModel.findOneAndUpdate(
          { _id: id },
          {
            carPicsPath: carPicsPath,
            brand: brand,
            model: model,
            price: price,
            volume: volume,
            transmission,
            color,
            year,
            odometr,
            vincode,
            plates,
            description,
          },
          { new: true }
        );


        if (!car) {
          return reply.status(404).send({ message: 'Car not found' });
        }

        return reply.send(car);
      } catch (error) {
        console.error(error);
        return reply.status(500).send({ message: 'Internal Server Error' });
      }
    }
  );

  fastify.delete(
    '/car-delete/:id',
    {
      schema: deleteCarSchema,
    },
    async (req, reply) => {
      const id = req.params.id;

      try {
        const car = await CarModel.findByIdAndDelete(id);

        if (!car) {
          return reply.status(404).send({ message: 'Car not found' });
        }

        return reply.send({ message: 'Car deleted successfully' });
      } catch (error) {
        console.error(error);
        return reply.status(500).send({ message: 'Internal Server Error' });
      }
    }
  );

  fastify.get(
    '/car-checks',
    {
      schema: getAllCarCheckSchema,
    },
    (req, reply) => {
      CarCheckModel.find({ 'checker.checkerId': '' })
        .lean()
        .select(
          'brand model town link wantToCheckId firstName phone email checker'
        )
        .then((result) => {
          reply.send(result);
        })
        .catch((error) => {
          reply.send(error);
        });
    }
  );

  fastify.get(
    '/car-checks-expert/:id',
    {
      schema: getAllCarCheckSchema,
    },
    (req, reply) => {
      const id = req.params.id;

      CarCheckModel.find({ 'checker.checkerId': id })
        .lean()
        .select(
          'brand model town link wantToCheckId firstName phone email checker'
        )
        .then((result) => {
          reply.send(result);
        })
        .catch((error) => {
          reply.send(error);
        });
    }
  );

  fastify.get(
    '/car-checks-own/:id',
    {
      schema: getAllCarCheckSchema,
    },
    (req, reply) => {
      const id = req.params.id;
      CarCheckModel.find({ wantToCheckId: id })
        .lean()
        .select(
          'brand model town link wantToCheckId firstName phone email checker'
        )
        .then((result) => {
          reply.send(result);
        })
        .catch((error) => {
          reply.send(error);
        });
    }
  );

  fastify.post(
    '/car-checks',
    {
      schema: createCarCheckSchema,
    },
    async (req, reply) => {
      const {
        brand,
        model,
        town,
        link,
        wantToCheckId,
        firstName,
        phone,
        email,
      } = req.body;

      try {
        const carCheck = new CarCheckModel({
          brand,
          model,
          town,
          link,
          wantToCheckId,
          firstName,
          phone,
          email,
          checker: {
            checkerId: '',
            name: '',
            phone: '',
          },
        });

        await carCheck.save();
        console.log(`${brand} ${model} car check saved to collection`);

        reply.code(201).send(carCheck);
      } catch (error) {
        console.error(error);
        reply.status(500).send({ message: 'Internal Server Error' });
      }
    }
  );

  fastify.put(
    '/car-check-sign/:id',
    { schema: updateCarCheckSchema },
    async (req, reply) => {
      const id = req.params.id;
      const { checker } = req.body;

      try {
        const carCheck = await CarCheckModel.findOneAndUpdate(
          { _id: id },
          {
            checker,
          },
          { new: true }
        );
        if (!carCheck) {
          return reply.status(404).send({ message: 'Car check not found' });
        }

        return reply.send(carCheck);
      } catch (error) {
        console.error(error);
        return reply.status(500).send({ message: 'Internal Server Error' });
      }
    }
  );

  fastify.delete(
    '/car-check-delete/:id',
    {
      schema: deleteCarCheckSchema,
    },
    async (req, reply) => {
      const id = req.params.id;

      try {
        const carCheck = await CarCheckModel.findByIdAndDelete(id);

        if (!carCheck) {
          return reply.status(404).send({ message: 'Car check not found' });
        }

        return reply.send({ message: 'Car check deleted successfully' });
      } catch (error) {
        console.error(error);
        return reply.status(500).send({ message: 'Internal Server Error' });
      }
    }
  );

  fastify.get(
    '/generateToken/:id',
    {
      schema: generateTokenSchema,
    },
    (req, reply) => {
      const data = {
        name: req.params.id,
      };

      const token = fastify.jwt.sign(data);
      const refreshToken = fastify.jwt.sign(data, { expiresIn: '7d' });
      reply.send({ token, refreshToken });
    }
  );

  fastify.get(
    '/validateToken',
    {
      onRequest: [fastify.authenticate],
      schema: validateTokenSchema,
    },
    async function (req, reply) {
      return req.user;
    }
  );

  fastify.post(
    '/refresh-token',
    {
      schema: refreshTokenSchema,
    },
    async (req, reply) => {
      const { refreshToken } = req.body;

      try {
        const decoded = await fastify.jwt.verify(refreshToken);

        const token = fastify.jwt.sign({ username: decoded.username }, { expiresIn: '7d' });
        const newRefreshToken = fastify.jwt.sign(
          { username: decoded.username },
          { expiresIn: '7d' }
        );

        reply.send({ token, newRefreshToken });
      } catch (err) {
        reply
          .status(401)
          .send({ message: 'Некоректний або вичерпаний токен оновлення' });
      }
    }
  );

  fastify.get(
    '/user/:email',
    {
      schema: getUserSchema,
    },
    (req, reply) => {
      const email = req.params.email;

      UserModel.findOne({ email: email })
        .lean()
        .select('id avatarPath firstName secondName dateRegistration email phone isAvtovukyp isExpert password')
        .then((result) => {
          reply.send(result);
        })
        .catch((err) => {
          return err;
        });
    }
  );

  fastify.get(
    '/user-phone/:id',
    (req, reply) => {
      const id = req.params.id;

      UserModel.findOne({ _id: id })
        .lean()
        .select('phone')
        .then((result) => {
          reply.send(result.phone);
        })
        .catch((err) => {
          return err;
        });
    }
  );

  fastify.post(
    '/login',
    {
      schema: UserLoginSchema,
    },
    async (req, reply) => {
      const { email, password } = req.body;

      const data = {
        email,
      };

      const user = await UserModel.findOne({ email });

      if (!user) {
        return reply.status(401).send({ message: 'Invalid credentials' });
      }

      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        return reply.status(401).send({ message: 'Invalid credentials' });
      }

      const token = fastify.jwt.sign(data, { expiresIn: '7d' });
      const refreshToken = fastify.jwt.sign(data, { expiresIn: '7d' });

      reply.send({ token, refreshToken });
    }
  );

  fastify.post('/signup', { schema: UserSignupSchema }, async (req, reply) => {
    const {
      avatarPath,
      firstName,
      secondName,
      email,
      phone,
      isAvtovukyp,
      isExpert,
      password,
    } = req.body;

    const existingUser = await UserModel.findOne({ email });
    if (existingUser) {
      return reply
        .status(409)
        .send({ message: 'User with the provided email already exists' });
    }

    const newUser = new UserModel({
      avatarPath,
      firstName,
      secondName,
      dateRegistration: new Date(),
      email,
      phone,
      isAvtovukyp,
      isExpert,
      password,
    });

    try {
      const hashedPassword = await bcrypt.hash(password, 10);
      newUser.password = hashedPassword;

      await newUser.save();

      reply.code(201).send({ message: 'User created successfully' });
    } catch (error) {
      console.error(error);
      reply.status(500).send({ message: 'Internal Server Error' });
    }
  });

  fastify.post('/upload', async function (req, reply) {

    const data = await req.file()

    await pump(data.file, fs.createWriteStream(`uploads/${ Date.now() + "-" + data.filename }`))

    reply.send("SUCCESS");
  });

  fastify.get('/upload/:filename', async function (req, reply) {
    return reply.sendFile(`/${req.params.filename}`);
  });

  fastify.get('/files/:filename', async function (req, reply) {
    const { filename } = req.params;
    const fileNames = filename.split(',');
    const fileContents = [];
    fileNames.forEach(fileName => {
      const filePath = path.join(__dirname, 'uploads', fileName);
      const fileContent = fs.readFileSync(filePath);
      const mimeType = mime.getType(filePath);
      fileContents.push({ content: fileContent.toString('base64'), type: mimeType });
    });

    reply.send(fileContents);
  });

  fastify.post('/upload-many/:id', async function (req, reply) {
    const id = req.params.id;
    const parts = req.parts()

    let names = []
    // eslint-disable-next-line node/no-unsupported-features/es-syntax
    for await (const part of parts) {
      if (part.type === 'file') {
        const name = Date.now() + "-" + part.filename;
        await pump(part.file, fs.createWriteStream(`uploads/${ name }`))
        names.push(name)
      } else {
        console.log(part)
      }
    }
    if(names.length > 0) {
      const car  = await CarModel.findOneAndUpdate(
        { _id: id },
        {
          carPicsPath: names,
        },
        { new: true }
      );
      console.log(car);
    }
    reply.send()
  })

  fastify.get(
    '/home',
    {
      onRequest: [fastify.authenticate],
    },
    async function (req, reply) {
      return reply.send('in home');
    }
  );

  fastify.listen({ port: 3000 }, (error) => {
    if (error) {
      throw error;
    } else {
      console.log('Server is running on port 3000');
    }
  });
}

start();
