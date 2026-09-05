class AppUser {
  final String id;
  final String role;
  final String? schoolId;
  final String? schoolName;
  final String? branchId;
  AppUser({required this.id, required this.role, this.schoolId, this.schoolName, this.branchId});
  factory AppUser.fromJson(Map<String,dynamic> j)=>AppUser(id:'${j['id']??j['userId']??''}',role:'${j['role']??''}'.toLowerCase(),schoolId:j['schoolId']?.toString(),schoolName:j['schoolName']?.toString(),branchId:j['branchId']?.toString());
}

class DashboardData {
  final Map<String,dynamic> data;
  DashboardData(this.data);
}
