import express from "express";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

// Middleware to set CORS headers
app.use((req, res, next) => {
	res.setHeader("Access-Control-Allow-Origin", "*");
	// Other headers you might need to set
	res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE");
	res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
	// Allow credentials if needed
	res.setHeader("Access-Control-Allow-Credentials", "true");
	next();
});

// Function to check if all required keys are present in the request data
const validateRequestData = (data, requiredKeys) => {
	if (!data) {
		return false;
	}
	return requiredKeys.every((key) => key in data);
};

// Proxy endpoint for Klaviyo API profiles
app.post("/notificationPopup", async (req, res) => {
	const requiredKeys = ["firstname", "email", "zipcode", "birthday", "segment"];
	const requestData = req.body;

	if (!validateRequestData(requestData, requiredKeys)) {
		return res.status(400).json({ error: "Missing required keys" });
	}

	const profile_url = "https://a.klaviyo.com/api/profiles/";

	let list = process.env.KLAVIYO_NOT_COVERED_LIST;
	if (requestData.segment === "covered")
		list = process.env.KLAVIYO_COVERED_LIST;
	else if (requestData.segment !== "not-covered") {
		return res.status(400).json({ error: "Invalid segment" });
	}

	const lists_url = `https://a.klaviyo.com/api/lists/${list}/relationships/profiles/`;

	const apiKey = process.env.KLAVIYO_API_KEY;
	const headers = {
		accept: "application/json",
		"content-type": "application/json",
		revision: "2024-06-15",
		Authorization: `Klaviyo-API-Key ${apiKey}`,
	};

	const profileData = {
		data: {
			type: "profile",
			attributes: {
				email: requestData.email,
				first_name: requestData.firstname,
				location: {
					zip: requestData.zipcode,
				},
				properties: {
					zipcode: requestData.zipcode,
					birthday: requestData.birthday,
				},
			},
		},
	};

	try {
		const profileResponse = await fetch(profile_url, {
			method: "POST",
			headers: headers,
			body: JSON.stringify(profileData),
		});

		const profileResponseData = await profileResponse.json();
		let profileId = null;
		if (profileResponseData.errors) {
			profileResponseData.errors.forEach((error) => {
				if (error.code == "duplicate_profile") {
					profileId = error.meta.duplicate_profile_id;
				}
			});
		} else {
			profileId = profileResponseData.data.id;
		}

		if (!profileId) {
			return res
				.status(500)
				.json({ error: "Failed to create or find profile in Klaviyo" });
		}

		const listsData = {
			data: [
				{
					type: "profile",
					id: profileId,
				},
			],
		};

		const listsResponse = await fetch(lists_url, {
			method: "POST",
			headers: headers,
			body: JSON.stringify(listsData),
		});

		if (!listsResponse.ok && listsResponse.status != 204) {
			return res
				.status(500)
				.json({ error: "Failed to add profile to list in Klaviyo" });
		}
		res.json({
			success: "data submitted to klaviyo",
		});
	} catch (error) {
		console.error("Error:", error);
		res.status(500).json({ error: "Failed to fetch data from Klaviyo API" });
	}
});

// Start the server
app.listen(port, () => {
	console.log(`Server is running on http://localhost:${port}`);
});
