/**
 * @swagger
 * components:
 *   schemas:
 *     UpdatePokemonDto:
 *       type: object
 *       properties:
 *         localizedName:
 *           type: string
 *           description: Localized nomenclature for the Pokemon
 *           example: Bulbasaur (LATAM)
 *         region:
 *           type: string
 *           description: Geographical metadata
 *           example: Kanto
 *         classificationTag:
 *           type: string
 *           description: Internal classification tag
 *           example: starter
 *         description:
 *           type: string
 *           description: Narrative description override
 *           example: A strange seed was planted on its back at birth.
 *     RegisterDto:
 *       type: object
 *       required:
 *         - email
 *         - userName
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           description: Primary email address — must be unique
 *           example: ash@pallet.town
 *         userName:
 *           type: string
 *           description: Display name
 *           example: ash
 *         password:
 *           type: string
 *           minLength: 8
 *           description: Password — minimum 8 characters
 *           example: PikaPika123!
 *     LoginDto:
 *       type: object
 *       required:
 *         - email
 *         - password
 *       properties:
 *         email:
 *           type: string
 *           format: email
 *           example: ash@pallet.town
 *         password:
 *           type: string
 *           example: PikaPika123!
 *     RefreshDto:
 *       type: object
 *       required:
 *         - refreshToken
 *       properties:
 *         refreshToken:
 *           type: string
 *           description: Opaque refresh token issued at login/register/refresh
 *     CatchDto:
 *       type: object
 *       description: Optional body for the catch (sync) routes — ballType may also be passed as a query parameter.
 *       properties:
 *         ballType:
 *           type: string
 *           enum: [poke, great, ultra, master]
 *           default: poke
 *           description: Which ball to throw. Consumed whether the catch succeeds or the pokemon escapes.
 *           example: great
 *     BuyBallsDto:
 *       type: object
 *       required:
 *         - ballType
 *         - quantity
 *       properties:
 *         ballType:
 *           type: string
 *           enum: [poke, great, ultra, master]
 *           example: great
 *         quantity:
 *           type: integer
 *           minimum: 1
 *           maximum: 99
 *           example: 5
 */

export {};
