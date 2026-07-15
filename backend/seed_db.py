import firebase_admin
from firebase_admin import credentials, firestore
import json

try:
    cred = credentials.Certificate('firebase-credentials.json')
    firebase_admin.initialize_app(cred)
    print("Initialized Firebase.")
except ValueError:
    print("Firebase already initialized.")

db = firestore.client()

policies = [
    {
        'policy_number': 'POL-10001', 'password': 'pass10001',
        'first_name': 'Alice', 'last_name': 'Smith',
        'vehicle_model': '2019 Toyota Camry', 'coverage_type': 'Comprehensive', 'deductible': 500, 'status': 'Active'
    },
    {
        'policy_number': 'POL-10002', 'password': 'pass10002',
        'first_name': 'Bob', 'last_name': 'Johnson',
        'vehicle_model': '2021 Honda Accord', 'coverage_type': 'Liability', 'deductible': 1000, 'status': 'Active'
    },
    {
        'policy_number': 'POL-10003', 'password': 'pass10003',
        'first_name': 'Charlie', 'last_name': 'Brown',
        'vehicle_model': '2018 Ford F-150', 'coverage_type': 'Comprehensive', 'deductible': 250, 'status': 'Active'
    },
    {
        'policy_number': 'POL-10004', 'password': 'pass10004',
        'first_name': 'Diana', 'last_name': 'Prince',
        'vehicle_model': '2023 Tesla Model Y', 'coverage_type': 'Comprehensive', 'deductible': 1000, 'status': 'Active'
    },
    {
        'policy_number': 'POL-10005', 'password': 'pass10005',
        'first_name': 'Ethan', 'last_name': 'Hunt',
        'vehicle_model': '2020 BMW 3 Series', 'coverage_type': 'Collision', 'deductible': 500, 'status': 'Active'
    },
    {
        'policy_number': 'POL-10006', 'password': 'pass10006',
        'first_name': 'Fiona', 'last_name': 'Gallagher',
        'vehicle_model': '2017 Chevrolet Malibu', 'coverage_type': 'Liability', 'deductible': 500, 'status': 'Active'
    },
    {
        'policy_number': 'POL-10007', 'password': 'pass10007',
        'first_name': 'George', 'last_name': 'Costanza',
        'vehicle_model': '2015 Hyundai Elantra', 'coverage_type': 'Comprehensive', 'deductible': 250, 'status': 'Active'
    },
    {
        'policy_number': 'POL-10008', 'password': 'pass10008',
        'first_name': 'Hannah', 'last_name': 'Montana',
        'vehicle_model': '2022 Subaru Outback', 'coverage_type': 'Comprehensive', 'deductible': 500, 'status': 'Active'
    },
    {
        'policy_number': 'POL-10009', 'password': 'pass10009',
        'first_name': 'Ian', 'last_name': 'Malcolm',
        'vehicle_model': '1993 Jeep Wrangler', 'coverage_type': 'Liability', 'deductible': 1000, 'status': 'Active'
    },
    {
        'policy_number': 'POL-10010', 'password': 'pass10010',
        'first_name': 'Julia', 'last_name': 'Child',
        'vehicle_model': '2021 Lexus RX', 'coverage_type': 'Comprehensive', 'deductible': 500, 'status': 'Active'
    }
]

batch = db.batch()
collection_ref = db.collection('policies')

for p in policies:
    doc_ref = collection_ref.document(p['policy_number'])
    batch.set(doc_ref, p)

batch.commit()

print(f"Successfully seeded {len(policies)} policies into 'policies' collection.")
