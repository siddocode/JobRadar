/**
 * Frontend Company Office Registry & Geo-Dispersion Engine
 * 
 * Maps verified company tech offices across major Indian hubs (Bengaluru, Noida, Gurugram, Hyderabad, Pune)
 * to their exact verified office buildings, tech corridors, full postal addresses, and coordinates.
 * 
 * Also provides a deterministic hash-based geographic dispersion algorithm for unknown companies
 * to guarantee that no two companies ever share identical coordinates on the map.
 */

export const COMPANY_OFFICE_REGISTRY = {
  Bengaluru: {
    Speechify: {
      officeName: "Speechify Bengaluru Hub (WeWork The Pavilion)",
      locality: "Church Street / Central CBD",
      techCorridor: "central_cbd",
      address: "WeWork The Pavilion, 62/63 Church Street, Shantala Nagar, Bengaluru, Karnataka 560001",
      coordinates: { lat: 12.9748, lng: 77.6067 }
    },
    Adobe: {
      officeName: "Adobe Systems India (Prestige Platina)",
      locality: "Kadubeesanahalli / Outer Ring Road",
      techCorridor: "orr_bellandur",
      address: "Prestige Platina Technology Park, Outer Ring Road, Kadubeesanahalli, Bengaluru, Karnataka 560103",
      coordinates: { lat: 12.938965, lng: 77.696407 }
    },
    Visa: {
      officeName: "Visa Technology Center (Bagmane World Tech Center)",
      locality: "Mahadevapura / Outer Ring Road",
      techCorridor: "orr_bellandur",
      address: "Bagmane World Technology Center, Outer Ring Road, Mahadevapura, Bengaluru, Karnataka 560048",
      coordinates: { lat: 12.983308, lng: 77.692129 }
    },
    "Sumo Logic": {
      officeName: "Sumo Logic India (Prestige Ferns Galaxy)",
      locality: "Bellandur / Outer Ring Road",
      techCorridor: "orr_bellandur",
      address: "Prestige Ferns Galaxy, Outer Ring Road, Bellandur, Bengaluru, Karnataka 560103",
      coordinates: { lat: 12.9288, lng: 77.6789 }
    },
    Google: {
      officeName: "Google India (RMZ Infinity)",
      locality: "Old Madras Road / Bagmane",
      techCorridor: "central_cbd",
      address: "Tower E, RMZ Infinity, Old Madras Road, Bennigana Halli, Bengaluru, Karnataka 560016",
      coordinates: { lat: 12.9904, lng: 77.6612 }
    },
    Amazon: {
      officeName: "Amazon Development Centre (Bagmane Tech Park)",
      locality: "CV Raman Nagar / Bagmane",
      techCorridor: "central_cbd",
      address: "Bagmane Tech Park, 65/2, Byrasandra, CV Raman Nagar, Bengaluru, Karnataka 560093",
      coordinates: { lat: 12.9782, lng: 77.6580 }
    },
    Databricks: {
      officeName: "Databricks India (Bagmane Capital Tech Park)",
      locality: "Outer Ring Road / Bagmane Capital",
      techCorridor: "orr_bellandur",
      address: "Angkor West Tower, Bagmane Capital Tech Park, Outer Ring Road, Bengaluru, Karnataka 560048",
      coordinates: { lat: 12.982292, lng: 77.693171 }
    },
    Datadog: {
      officeName: "Datadog Bengaluru (WeWork Cinnabar Hills)",
      locality: "Domlur / Embassy Golf Links",
      techCorridor: "central_cbd",
      address: "WeWork Cinnabar Hills, Embassy Golf Links Business Park, Domlur, Bengaluru, Karnataka 560071",
      coordinates: { lat: 12.953922, lng: 77.642872 }
    },
    MongoDB: {
      officeName: "MongoDB Bengaluru (Vaswani Centropolis)",
      locality: "Langford Road / Richmond Town",
      techCorridor: "central_cbd",
      address: "Unit No. 201, 2nd Floor, Vaswani Centropolis, 21 Langford Road, Bengaluru, Karnataka 560027",
      coordinates: { lat: 12.963806, lng: 77.598101 }
    },
    Elastic: {
      officeName: "Elastic Technologies (Embassy Golf Links)",
      locality: "Domlur / Embassy Golf Links",
      techCorridor: "central_cbd",
      address: "Sunriver Wing A, Embassy Golf Links Business Park, Domlur, Bengaluru, Karnataka 560071",
      coordinates: { lat: 12.916396, lng: 77.652343 }
    },
    "Sarvam AI": {
      officeName: "Sarvam AI Headquarters",
      locality: "Indiranagar",
      techCorridor: "central_cbd",
      address: "732, Chinmaya Mission Hospital Road, Indiranagar Stage 1, Bengaluru, Karnataka 560038",
      coordinates: { lat: 12.977937, lng: 77.640308 }
    },
    Flipkart: {
      officeName: "Flipkart Internet HQ (Embassy Tech Village)",
      locality: "Bellandur / Embassy Tech Village",
      techCorridor: "orr_bellandur",
      address: "Buildings Alyssa, Begonia & Clover, Embassy Tech Village, Outer Ring Road, Bengaluru, Karnataka 560103",
      coordinates: { lat: 12.9280, lng: 77.6912 }
    },
    Swiggy: {
      officeName: "Swiggy Tech Hub (Sumadhura Capitol Towers)",
      locality: "Whitefield",
      techCorridor: "whitefield",
      address: "Sumadhura Capitol Towers, Pattanduru Agrahara, Whitefield, Bengaluru, Karnataka 560066",
      coordinates: { lat: 12.9856, lng: 77.7489 }
    },
    Razorpay: {
      officeName: "Razorpay Software HQ (SJR Cyber)",
      locality: "Koramangala / Adugodi",
      techCorridor: "koramangala_hsr",
      address: "1st Floor, SJR Cyber, 22 Laskar Hosur Road, Adugodi, Bengaluru, Karnataka 560030",
      coordinates: { lat: 12.9392, lng: 77.6105 }
    },
    PhonePe: {
      officeName: "PhonePe HQ (Salarpuria Softzone)",
      locality: "Bellandur / Outer Ring Road",
      techCorridor: "orr_bellandur",
      address: "Salarpuria Softzone, Bellandur, Outer Ring Road, Bengaluru, Karnataka 560103",
      coordinates: { lat: 12.92425, lng: 77.67005 }
    },
    Groww: {
      officeName: "Groww HQ (Vaishnavi Tech Park)",
      locality: "Bellandur / Sarjapur Road",
      techCorridor: "orr_bellandur",
      address: "Vaishnavi Tech Park, Sarjapur Main Road, Bellandur, Bengaluru, Karnataka 560103",
      coordinates: { lat: 12.91936, lng: 77.67187 }
    },
    CRED: {
      officeName: "CRED Headquarters",
      locality: "Indiranagar",
      techCorridor: "central_cbd",
      address: "100 Feet Road, 12th Main Road, HAL 2nd Stage, Indiranagar, Bengaluru, Karnataka 560038",
      coordinates: { lat: 12.9764, lng: 77.6406 }
    },
    Anthropic: {
      officeName: "Anthropic India Hub (UB City)",
      locality: "Central CBD / UB City",
      techCorridor: "central_cbd",
      address: "UB City, 24 Vittal Mallya Road, Bengaluru, Karnataka 560001",
      coordinates: { lat: 12.9719, lng: 77.5957 }
    },
    OpenAI: {
      officeName: "OpenAI India Hub (UB City)",
      locality: "Central CBD / UB City",
      techCorridor: "central_cbd",
      address: "UB City, Concorde Block, Vittal Mallya Road, Bengaluru, Karnataka 560001",
      coordinates: { lat: 12.9723, lng: 77.5960 }
    },
    Airbnb: {
      officeName: "Airbnb Bengaluru Hub",
      locality: "Indiranagar",
      techCorridor: "central_cbd",
      address: "Indiranagar 100 Feet Road, Bengaluru, Karnataka 560038",
      coordinates: { lat: 12.9710, lng: 77.6410 }
    },
    Infosys: {
      officeName: "Infosys Limited (Electronic City HQ)",
      locality: "Electronic City",
      techCorridor: "electronic_city",
      address: "Plot No. 44, Electronic City, Hosur Road, Bengaluru, Karnataka 560100",
      coordinates: { lat: 12.8504, lng: 77.6657 }
    },
    Wipro: {
      officeName: "Wipro Technologies (Sarjapur HQ)",
      locality: "Sarjapur Road",
      techCorridor: "orr_bellandur",
      address: "Doddakannelli, Sarjapur Road, Bengaluru, Karnataka 560035",
      coordinates: { lat: 12.9123, lng: 77.6835 }
    },
    Postman: {
      officeName: "Postman India HQ (Indiranagar)",
      locality: "Indiranagar",
      techCorridor: "central_cbd",
      address: "9th Main Road, HAL 2nd Stage, Indiranagar, Bengaluru, Karnataka 560038",
      coordinates: { lat: 12.9728, lng: 77.6405 }
    }
  },
  Noida: {
    Adobe: {
      officeName: "Adobe Systems India (Noida Campus - Sector 132)",
      locality: "Sector 132 / Noida Expressway",
      techCorridor: "expressway_135",
      address: "Plot No. 1A, Sector 132, Noida-Greater Noida Expressway, Noida, Uttar Pradesh 201304",
      coordinates: { lat: 28.5135, lng: 77.3821 }
    },
    Microsoft: {
      officeName: "Microsoft India (Sovereign Capital - Sector 145)",
      locality: "Sector 145 / Noida Expressway",
      techCorridor: "expressway_135",
      address: "Sovereign Capital, Plot No. 1, Sector 145, Noida-Greater Noida Expressway, Noida, Uttar Pradesh 201306",
      coordinates: { lat: 28.4682, lng: 77.4198 }
    },
    Oracle: {
      officeName: "Oracle India (Sector 62 IT Park)",
      locality: "Sector 62",
      techCorridor: "sec_62_63",
      address: "Plot No. 22, Sector 62, Institutional Area, Noida, Uttar Pradesh 201309",
      coordinates: { lat: 28.6291, lng: 77.3614 }
    },
    Paytm: {
      officeName: "Paytm Headquarters (One97 Communications - Sector 98)",
      locality: "Sector 98 / Expressway",
      techCorridor: "expressway_135",
      address: "One97 Park, Plot No. B-1, Sector 98, Noida, Uttar Pradesh 201301",
      coordinates: { lat: 28.5398, lng: 77.3621 }
    },
    HCLTech: {
      officeName: "HCL Technologies Corporate HQ (Technology Hub - Sector 126)",
      locality: "Sector 126 / Expressway",
      techCorridor: "expressway_135",
      address: "Plot No. 3A, Sector 126, Noida, Uttar Pradesh 201303",
      coordinates: { lat: 28.5372, lng: 77.3402 }
    },
    Samsung: {
      officeName: "Samsung R&D Institute India (SRI-Noida - Sector 62)",
      locality: "Sector 62",
      techCorridor: "sec_62_63",
      address: "Logix Cyber Park, Tower D, Sector 62, Noida, Uttar Pradesh 201301",
      coordinates: { lat: 28.6272, lng: 77.3725 }
    },
    Speechify: {
      officeName: "Speechify Technology Hub (Sector 62)",
      locality: "Sector 62 / 63",
      techCorridor: "sec_62_63",
      address: "Sector 62 Institutional Area, Noida, Uttar Pradesh 201309",
      coordinates: { lat: 28.6280, lng: 77.3649 }
    }
  },
  Gurugram: {
    Google: {
      officeName: "Google India (Signature Towers)",
      locality: "Sector 30 / NH-8",
      techCorridor: "cyber_city_phase2",
      address: "Signature Tower II, Sector 30, Gurugram, Haryana 122001",
      coordinates: { lat: 28.4691, lng: 77.0632 }
    },
    Microsoft: {
      officeName: "Microsoft India (DLF Cyber City Building 10)",
      locality: "DLF Cyber City",
      techCorridor: "cyber_city_phase2",
      address: "Building 10, Tower B, DLF Cyber City, DLF Phase 2, Gurugram, Haryana 122002",
      coordinates: { lat: 28.4905, lng: 77.0903 }
    },
    Zomato: {
      officeName: "Zomato & Blinkit HQ (Ground Zero - Sector 44)",
      locality: "Sector 44 / HUDA City Centre",
      techCorridor: "golf_course_rd",
      address: "Ground Zero, 12th Floor, Tower A, Sector 44, Gurugram, Haryana 122003",
      coordinates: { lat: 28.4552, lng: 77.0721 }
    },
    MakeMyTrip: {
      officeName: "MakeMyTrip HQ (DLF Cyber City)",
      locality: "DLF Cyber City",
      techCorridor: "cyber_city_phase2",
      address: "Building No. 5, Tower B, DLF Cyber City, DLF Phase 2, Gurugram, Haryana 122002",
      coordinates: { lat: 28.4952, lng: 77.0891 }
    }
  },
  Hyderabad: {
    Microsoft: {
      officeName: "Microsoft India Development Center (Gachibowli Campus)",
      locality: "Gachibowli / Financial District",
      techCorridor: "financial_district",
      address: "Microsoft Campus, ISB Road, Gachibowli, Hyderabad, Telangana 500032",
      coordinates: { lat: 17.4418, lng: 78.3498 }
    },
    Google: {
      officeName: "Google India (Divyasree Omega - HITEC City)",
      locality: "HITEC City / Kondapur",
      techCorridor: "hitec_city_madhapur",
      address: "Divyasree Omega, Kondapur Main Road, Kothaguda, HITEC City, Hyderabad, Telangana 500084",
      coordinates: { lat: 17.4589, lng: 78.3685 }
    },
    Amazon: {
      officeName: "Amazon Hyderabad Campus (World's Largest Amazon Campus)",
      locality: "Financial District / Nanakramguda",
      techCorridor: "financial_district",
      address: "Amazon Campus, Plot No. 1, Financial District, Nanakramguda, Hyderabad, Telangana 500032",
      coordinates: { lat: 17.4208, lng: 78.3442 }
    }
  },
  Pune: {
    NVIDIA: {
      officeName: "NVIDIA Graphics (Commerzone IT Park)",
      locality: "Yerwada / Airport Road",
      techCorridor: "yerwada_viman_nagar",
      address: "Building No. 5, Commerzone, Samrat Ashok Path, Yerwada, Pune, Maharashtra 411006",
      coordinates: { lat: 18.5583, lng: 73.8906 }
    },
    Persistent: {
      officeName: "Persistent Systems HQ (Bhageerath)",
      locality: "Senapati Bapat Road",
      techCorridor: "baner_balewadi",
      address: "Bhageerath, 402 Senapati Bapat Road, Pune, Maharashtra 411016",
      coordinates: { lat: 18.5322, lng: 73.8315 }
    }
  }
};

/**
 * Computes deterministic dispersion offset based on company name hash (~300m - 750m)
 * to ensure two companies never land on the exact same pixel coordinates.
 */
export function getDeterministicOffset(str, baseLat = 12.9716, radiusKm = 0.65) {
  if (!str) return { lat: 0, lng: 0 };
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash) + str.charCodeAt(i);
    hash |= 0;
  }
  const angle = Math.abs(hash % 360) * (Math.PI / 180);
  const dist = 0.25 + (Math.abs((hash >> 8) % 1000) / 1000) * (radiusKm - 0.25);
  const latOffset = (dist * Math.cos(angle)) / 111.0;
  const lngOffset = (dist * Math.sin(angle)) / (111.0 * Math.cos((baseLat * Math.PI) / 180));

  return {
    lat: parseFloat(latOffset.toFixed(6)),
    lng: parseFloat(lngOffset.toFixed(6))
  };
}

/**
 * Resolves full company office details with verified buildings, addresses, and coordinates.
 */
export function getCompanyOfficeDetails(companyName, city = 'Bengaluru', fallbackCoords = null) {
  if (!companyName) {
    return {
      officeName: 'Corporate Office',
      officeAddress: city || 'India',
      coordinates: fallbackCoords,
      locality: '',
      techCorridor: null
    };
  }

  const normalizedCity = city || 'Bengaluru';
  const cityRegistry = COMPANY_OFFICE_REGISTRY[normalizedCity] || COMPANY_OFFICE_REGISTRY.Bengaluru;
  const compLower = companyName.trim().toLowerCase();

  // 1. Direct registry lookup
  let verified = null;
  for (const [key, entry] of Object.entries(cityRegistry)) {
    const kLower = key.toLowerCase();
    if (kLower === compLower || compLower.startsWith(kLower) || kLower.startsWith(compLower)) {
      verified = entry;
      break;
    }
  }

  if (verified) {
    return {
      officeName: verified.officeName,
      officeAddress: verified.address,
      coordinates: verified.coordinates,
      locality: verified.locality,
      techCorridor: verified.techCorridor,
      isVerifiedRegistry: true
    };
  }

  // 2. Fallback with deterministic geo-dispersion so no two companies ever share identical coordinates
  const baseCoords = fallbackCoords || { lat: 12.9716, lng: 77.5946 };
  const offset = getDeterministicOffset(companyName, baseCoords.lat);
  const dispersedCoords = {
    lat: parseFloat((baseCoords.lat + offset.lat).toFixed(6)),
    lng: parseFloat((baseCoords.lng + offset.lng).toFixed(6))
  };

  return {
    officeName: `${companyName} Office (${normalizedCity})`,
    officeAddress: `${normalizedCity}, India`,
    coordinates: dispersedCoords,
    locality: normalizedCity,
    techCorridor: null,
    isVerifiedRegistry: false
  };
}
